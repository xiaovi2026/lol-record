use windows_capture::{
    capture::{Context, GraphicsCaptureApiHandler},
    graphics_capture_api::InternalCaptureControl,
    encoder::{AudioSettingsBuilder, ContainerSettingsBuilder, VideoEncoder, VideoSettingsBuilder},
    frame::Frame,
    monitor::Monitor,
    settings::{
        ColorFormat, CursorCaptureSettings, DrawBorderSettings, Settings,
        SecondaryWindowSettings, MinimumUpdateIntervalSettings, DirtyRegionSettings,
    },
};
use std::sync::{Arc, Mutex};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::path::Path;

struct CaptureHandler {
    encoder: Arc<Mutex<Option<VideoEncoder>>>,
}

impl GraphicsCaptureApiHandler for CaptureHandler {
    type Flags = (String, u32, u32, u32); // (path, width, height, bitrate_mbps)
    type Error = Box<dyn std::error::Error + Send + Sync>;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        let (path, width, height, bitrate_mbps) = ctx.flags;
        
        let video_settings = VideoSettingsBuilder::new(width, height)
            .frame_rate(60)
            .bitrate(bitrate_mbps * 1_000_000);
            
        let audio_settings = AudioSettingsBuilder::default().disabled(false);
        let container_settings = ContainerSettingsBuilder::default();
        
        let encoder = VideoEncoder::new(video_settings, audio_settings, container_settings, path)?;
        
        Ok(Self {
            encoder: Arc::new(Mutex::new(Some(encoder))),
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame<'_>,
        _capture_control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        if let Some(ref mut enc) = *self.encoder.lock().unwrap() {
            enc.send_frame(frame)?;
        }
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        if let Some(enc) = self.encoder.lock().unwrap().take() {
            enc.finish()?;
        }
        Ok(())
    }
}

// Wrapper for cpal::Stream to make it Send & Sync since WASAPI pointers can be shared safely inside Mutex.
pub struct SendStream(pub cpal::Stream);
unsafe impl Send for SendStream {}
unsafe impl Sync for SendStream {}

pub struct ActiveSession {
    capture_control: Option<windows_capture::capture::CaptureControl<CaptureHandler, Box<dyn std::error::Error + Send + Sync>>>,
    audio_streams: Vec<SendStream>,
    encoder: Arc<Mutex<Option<VideoEncoder>>>,
}

pub static ACTIVE_SESSION: Mutex<Option<ActiveSession>> = Mutex::new(None);

pub fn start_recording(
    output_path: &str,
    width: u32,
    height: u32,
    bitrate_mbps: u32,
    audio_output: &str,
    audio_input: &str,
) -> Result<(), String> {
    // Ensure parent directory exists
    let path = Path::new(output_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let encoder: Arc<Mutex<Option<VideoEncoder>>> = Arc::new(Mutex::new(None));
    let mut audio_streams = Vec::new();
    let host = cpal::default_host();
    
    // 1. Setup Audio loopback stream (Game sounds)
    if audio_output != "None" {
        let device = if audio_output == "Default" {
            host.default_output_device().ok_or("No default output device found")?
        } else {
            host.output_devices().map_err(|e| e.to_string())?
                .find(|d| d.name().map(|n| n == audio_output).unwrap_or(false))
                .ok_or(format!("Output device not found: {}", audio_output))?
        };
        
        let config = device.default_output_config().map_err(|e| e.to_string())?;
        let stream_config: cpal::StreamConfig = config.clone().into();
        
        let enc_audio = encoder.clone();
        
        let error_callback = |err| eprintln!("Audio loopback capture error: {:?}", err);
        
        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[f32], _| {
                        if let Some(ref mut enc) = *enc_audio.lock().unwrap() {
                            let mut byte_data = Vec::with_capacity(data.len() * 2);
                            for &sample in data {
                                let clamped = sample.clamp(-1.0, 1.0);
                                let val = (clamped * 32767.0) as i16;
                                byte_data.extend_from_slice(&val.to_le_bytes());
                            }
                            let _ = enc.send_audio_buffer(&byte_data, 0);
                        }
                    },
                    error_callback,
                    None
                )
            }
            cpal::SampleFormat::I16 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[i16], _| {
                        if let Some(ref mut enc) = *enc_audio.lock().unwrap() {
                            let mut byte_data = Vec::with_capacity(data.len() * 2);
                            for &val in data {
                                byte_data.extend_from_slice(&val.to_le_bytes());
                            }
                            let _ = enc.send_audio_buffer(&byte_data, 0);
                        }
                    },
                    error_callback,
                    None
                )
            }
            _ => Err(cpal::BuildStreamError::DeviceNotAvailable)
        }.map_err(|e| format!("Failed to build audio loopback stream: {}", e))?;
        
        stream.play().map_err(|e| e.to_string())?;
        audio_streams.push(SendStream(stream));
    }
    
    // 2. Setup Microphone stream
    if audio_input != "None" {
        let device = if audio_input == "Default" {
            host.default_input_device().ok_or("No default input device found")?
        } else {
            host.input_devices().map_err(|e| e.to_string())?
                .find(|d| d.name().map(|n| n == audio_input).unwrap_or(false))
                .ok_or(format!("Input device not found: {}", audio_input))?
        };
        
        let config = device.default_input_config().map_err(|e| e.to_string())?;
        let stream_config: cpal::StreamConfig = config.clone().into();
        let enc_audio = encoder.clone();
        let error_callback = |err| eprintln!("Microphone capture error: {:?}", err);
        
        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[f32], _| {
                        if let Some(ref mut enc) = *enc_audio.lock().unwrap() {
                            let mut byte_data = Vec::with_capacity(data.len() * 2);
                            for &sample in data {
                                let clamped = sample.clamp(-1.0, 1.0);
                                let val = (clamped * 32767.0) as i16;
                                byte_data.extend_from_slice(&val.to_le_bytes());
                            }
                            let _ = enc.send_audio_buffer(&byte_data, 0);
                        }
                    },
                    error_callback,
                    None
                )
            }
            cpal::SampleFormat::I16 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[i16], _| {
                        if let Some(ref mut enc) = *enc_audio.lock().unwrap() {
                            let mut byte_data = Vec::with_capacity(data.len() * 2);
                            for &val in data {
                                byte_data.extend_from_slice(&val.to_le_bytes());
                            }
                            let _ = enc.send_audio_buffer(&byte_data, 0);
                        }
                    },
                    error_callback,
                    None
                )
            }
            _ => Err(cpal::BuildStreamError::DeviceNotAvailable)
        }.map_err(|e| format!("Failed to build mic stream: {}", e))?;
        
        stream.play().map_err(|e| e.to_string())?;
        audio_streams.push(SendStream(stream));
    }
    
    // 3. Start WGC Screen Capture in a free-threaded background loop
    let monitor = Monitor::primary().map_err(|e| e.to_string())?;
    
    let settings = Settings::new(
        monitor,
        CursorCaptureSettings::Default,
        DrawBorderSettings::WithoutBorder,
        SecondaryWindowSettings::Default,
        MinimumUpdateIntervalSettings::Default,
        DirtyRegionSettings::Default,
        ColorFormat::Bgra8,
        (output_path.to_string(), width, height, bitrate_mbps),
    );
    
    // Start capture without blocking the thread
    let capture_control = CaptureHandler::start_free_threaded(settings)
        .map_err(|e| format!("Failed to start capture: {:?}", e))?;
        
    // Wait for the handler to populate the encoder in background thread
    let mut retries = 0;
    while encoder.lock().unwrap().is_none() && retries < 20 {
        std::thread::sleep(std::time::Duration::from_millis(50));
        retries += 1;
    }
    
    let mut session = ACTIVE_SESSION.lock().unwrap();
    *session = Some(ActiveSession {
        capture_control: Some(capture_control),
        audio_streams,
        encoder,
    });
    
    Ok(())
}

pub fn stop_recording() -> Result<String, String> {
    let mut session = ACTIVE_SESSION.lock().unwrap();
    if let Some(mut s) = session.take() {
        // Pause all audio streams
        for stream in s.audio_streams {
            let _ = stream.0.pause();
        }
        
        // Finalize the video encoder
        if let Some(enc) = s.encoder.lock().unwrap().take() {
            let _ = enc.finish();
        }
        
        // Stop screen capture
        if let Some(control) = s.capture_control.take() {
            let _ = control.stop();
        }
        
        return Ok("Success".to_string());
    }
    Err("No active recording found".to_string())
}
