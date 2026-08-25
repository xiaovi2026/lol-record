use super::audio::{AudioCaptureHandle, AudioSubsystem};
use super::capture::{CaptureHandle, ScreenCaptureEngine, VideoFrame};
use super::encoder::{EncoderHandle, MediaEncoder, MediaEncoderConfig};
use crate::config::AppSettings;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::{broadcast, mpsc, Mutex};
use tracing::info;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum RecordingState {
    Idle,
    Recording,
    Paused,
    Finalizing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingTelemetry {
    pub state: RecordingState,
    pub elapsed_seconds: u64,
    pub recorded_frames: u64,
    pub recorded_bytes: u64,
    pub fps: u32,
    pub bitrate_kbps: u32,
    pub resolution: String,
    pub output_file_path: Option<String>,
}

pub struct ActiveSession {
    pub start_time: Instant,
    pub temp_file_path: PathBuf,
    pub capture_handle: CaptureHandle,
    pub audio_handle: AudioCaptureHandle,
    pub encoder_handle: EncoderHandle,
}

pub struct RecorderManager {
    state: Arc<parking_lot::RwLock<RecordingState>>,
    active_session: Arc<Mutex<Option<ActiveSession>>>,
    telemetry_sender: broadcast::Sender<RecordingTelemetry>,
    encoder: Arc<MediaEncoder>,
    audio_subsystem: Arc<AudioSubsystem>,
    capture_engine: Arc<ScreenCaptureEngine>,
}

impl RecorderManager {
    pub fn new() -> Self {
        let (telemetry_sender, _) = broadcast::channel(16);
        Self {
            state: Arc::new(parking_lot::RwLock::new(RecordingState::Idle)),
            active_session: Arc::new(Mutex::new(None)),
            telemetry_sender,
            encoder: Arc::new(MediaEncoder::new()),
            audio_subsystem: Arc::new(AudioSubsystem::new()),
            capture_engine: Arc::new(ScreenCaptureEngine::new()),
        }
    }

    pub fn current_state(&self) -> RecordingState {
        self.state.read().clone()
    }

    pub fn subscribe_telemetry(&self) -> broadcast::Receiver<RecordingTelemetry> {
        self.telemetry_sender.subscribe()
    }

    /// Starts a recording session
    pub async fn start_recording(
        &self,
        settings: &AppSettings,
        custom_output: Option<PathBuf>,
    ) -> Result<PathBuf, String> {
        let mut session_guard = self.active_session.lock().await;
        if session_guard.is_some() {
            return Err("Recording session is already active".to_string());
        }

        *self.state.write() = RecordingState::Recording;

        let out_dir = settings.ensure_output_dir()?;
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        let temp_filename = format!("temp_recording_{}.mp4", timestamp);
        let target_path = custom_output.unwrap_or_else(|| out_dir.join(temp_filename));

        let (target_w, target_h) = match settings.video.resolution.as_str() {
            "2160p" => (3840, 2160),
            "1440p" => (2560, 1440),
            "720p" => (1280, 720),
            _ => (1920, 1080), // default 1080p
        };

        let (video_tx, video_rx) = mpsc::channel::<VideoFrame>(60);
        let (audio_tx, audio_rx) = mpsc::channel::<Vec<f32>>(100);

        // 1. Start Encoder
        let enc_config = MediaEncoderConfig {
            output_path: target_path.clone(),
            width: target_w,
            height: target_h,
            fps: settings.video.fps,
            bitrate_kbps: settings.video.bitrate_kbps,
            codec: settings.video.codec.clone(),
            encoder: settings.video.encoder.clone(),
        };

        let encoder_handle = self
            .encoder
            .start_encoding(enc_config, video_rx, audio_rx)?;

        // 2. Start Capture
        let capture_handle =
            self.capture_engine
                .start_capture(settings.video.fps, target_w, target_h, video_tx)?;

        // 3. Start Audio
        let audio_handle = self.audio_subsystem.start_capture_session(
            settings.audio.output_device.clone(),
            settings.audio.input_device.clone(),
            settings.audio.output_volume,
            settings.audio.input_volume,
            settings.audio.record_mic,
            audio_tx,
        )?;

        *session_guard = Some(ActiveSession {
            start_time: Instant::now(),
            temp_file_path: target_path.clone(),
            capture_handle,
            audio_handle,
            encoder_handle,
        });

        info!("Recording started successfully at {:?}", target_path);
        Ok(target_path)
    }

    /// Stops the recording session and returns the path to the recorded video
    pub async fn stop_recording(&self) -> Result<PathBuf, String> {
        let mut session_guard = self.active_session.lock().await;
        let session = session_guard
            .take()
            .ok_or("No active recording session to stop")?;

        *self.state.write() = RecordingState::Finalizing;

        info!("Stopping recording session...");
        session.capture_handle.stop();
        session.audio_handle.stop();
        session.encoder_handle.stop();

        // Allow encoder to flush container
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        *self.state.write() = RecordingState::Idle;
        info!(
            "Recording stopped. File saved at {:?}",
            session.temp_file_path
        );

        Ok(session.temp_file_path)
    }

    /// Periodic telemetry loop
    pub async fn start_telemetry_loop(self: Arc<Self>) {
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(1000));
        loop {
            interval.tick().await;

            let state = self.current_state();
            let session_guard = self.active_session.lock().await;

            let (elapsed, path_str) = if let Some(ref session) = *session_guard {
                (
                    session.start_time.elapsed().as_secs(),
                    Some(session.temp_file_path.to_string_lossy().to_string()),
                )
            } else {
                (0, None)
            };

            let telemetry = RecordingTelemetry {
                state,
                elapsed_seconds: elapsed,
                recorded_frames: self.encoder.encoded_frames(),
                recorded_bytes: self.encoder.encoded_bytes(),
                fps: 60,
                bitrate_kbps: 8000,
                resolution: "1080p".to_string(),
                output_file_path: path_str,
            };

            let _ = self.telemetry_sender.send(telemetry);
        }
    }
}
