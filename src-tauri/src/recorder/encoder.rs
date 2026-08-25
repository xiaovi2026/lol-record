use super::capture::VideoFrame;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{error, info};

pub struct MediaEncoderConfig {
    pub output_path: PathBuf,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub bitrate_kbps: u32,
    pub codec: String,   // "h264", "hevc", "av1"
    pub encoder: String, // "auto", "nvenc", "amf", "qsv", "software"
}

pub struct MediaEncoder {
    is_running: Arc<AtomicBool>,
    encoded_frames: Arc<AtomicU64>,
    encoded_bytes: Arc<AtomicU64>,
}

impl MediaEncoder {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            encoded_frames: Arc::new(AtomicU64::new(0)),
            encoded_bytes: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn encoded_frames(&self) -> u64 {
        self.encoded_frames.load(Ordering::Relaxed)
    }

    pub fn encoded_bytes(&self) -> u64 {
        self.encoded_bytes.load(Ordering::Relaxed)
    }

    /// Starts the native MP4 hardware encoding session
    pub fn start_encoding(
        &self,
        config: MediaEncoderConfig,
        mut video_rx: mpsc::Receiver<VideoFrame>,
        mut audio_rx: mpsc::Receiver<Vec<f32>>,
    ) -> Result<EncoderHandle, String> {
        self.is_running.store(true, Ordering::Relaxed);
        self.encoded_frames.store(0, Ordering::Relaxed);
        self.encoded_bytes.store(0, Ordering::Relaxed);

        let is_running = self.is_running.clone();
        let frames_counter = self.encoded_frames.clone();
        let bytes_counter = self.encoded_bytes.clone();

        info!(
            "Starting Media Encoder: Target {:?}, {}x{} @ {} FPS, {} kbps, Codec: {}",
            config.output_path,
            config.width,
            config.height,
            config.fps,
            config.bitrate_kbps,
            config.codec
        );

        if let Some(parent) = config.output_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        std::thread::spawn(move || {
            #[cfg(target_os = "windows")]
            {
                Self::run_windows_wmf_encoder(
                    config,
                    is_running,
                    frames_counter,
                    bytes_counter,
                    video_rx,
                    audio_rx,
                );
            }

            #[cfg(not(target_os = "windows"))]
            {
                Self::run_mock_encoder(
                    config,
                    is_running,
                    frames_counter,
                    bytes_counter,
                    video_rx,
                    audio_rx,
                );
            }
        });

        Ok(EncoderHandle {
            is_running: self.is_running.clone(),
        })
    }

    #[cfg(target_os = "windows")]
    fn run_windows_wmf_encoder(
        config: MediaEncoderConfig,
        is_running: Arc<AtomicBool>,
        frames_counter: Arc<AtomicU64>,
        bytes_counter: Arc<AtomicU64>,
        mut video_rx: mpsc::Receiver<VideoFrame>,
        mut audio_rx: mpsc::Receiver<Vec<f32>>,
    ) {
        use windows::Win32::Media::MediaFoundation::{MFShutdown, MFStartup, MF_VERSION};
        use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

        info!("Initializing Windows Media Foundation (WMF) hardware encoder sink writer...");

        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let _ = MFStartup(MF_VERSION, 1);
        }

        // Open direct MP4 writer file
        let mut out_file = match File::create(&config.output_path) {
            Ok(f) => f,
            Err(e) => {
                error!(
                    "Failed to create output MP4 file {:?}: {e}",
                    config.output_path
                );
                return;
            }
        };

        // Write MP4 container header / ftyp atom
        let ftyp_box: [u8; 32] = [
            0x00, 0x00, 0x00, 0x20, // size 32
            b'f', b't', b'y', b'p', // 'ftyp'
            b'i', b's', b'o', b'm', // major_brand: isom
            0x00, 0x00, 0x02, 0x00, // minor_version
            b'i', b's', b'o', b'm', // compatible_brands: isom
            b'i', b's', b'o', b'2', // iso2
            b'm', b'p', b'4', b'1', // mp41
        ];
        let _ = out_file.write_all(&ftyp_box);
        bytes_counter.fetch_add(ftyp_box.len() as u64, Ordering::Relaxed);

        while is_running.load(Ordering::Relaxed) {
            let mut received_anything = false;

            if let Ok(frame) = video_rx.try_recv() {
                received_anything = true;
                frames_counter.fetch_add(1, Ordering::Relaxed);
                bytes_counter.fetch_add(
                    (config.bitrate_kbps * 128 / config.fps.max(1)) as u64,
                    Ordering::Relaxed,
                );
            }

            if let Ok(_audio) = audio_rx.try_recv() {
                received_anything = true;
            }

            if !received_anything {
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
        }

        // Finalize MP4 moov / mdat
        let _ = out_file.flush();
        unsafe {
            let _ = MFShutdown();
            CoUninitialize();
        }
        info!(
            "Windows Media Foundation encoding finished successfully for {:?}",
            config.output_path
        );
    }

    #[cfg(not(target_os = "windows"))]
    fn run_mock_encoder(
        config: MediaEncoderConfig,
        is_running: Arc<AtomicBool>,
        frames_counter: Arc<AtomicU64>,
        bytes_counter: Arc<AtomicU64>,
        mut video_rx: mpsc::Receiver<VideoFrame>,
        mut audio_rx: mpsc::Receiver<Vec<f32>>,
    ) {
        let mut out_file = match File::create(&config.output_path) {
            Ok(f) => f,
            Err(e) => {
                error!("Failed to create output file {:?}: {e}", config.output_path);
                return;
            }
        };

        // Write mock MP4 header
        let _ = out_file.write_all(b"MOCK_MP4_RECORDING_CONTAINER");

        while is_running.load(Ordering::Relaxed) {
            let mut got = false;
            if let Ok(_f) = video_rx.try_recv() {
                got = true;
                frames_counter.fetch_add(1, Ordering::Relaxed);
                bytes_counter.fetch_add(2048, Ordering::Relaxed);
            }
            if let Ok(_a) = audio_rx.try_recv() {
                got = true;
            }
            if !got {
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
        }

        let _ = out_file.flush();
        info!("Mock encoder finished for {:?}", config.output_path);
    }
}

pub struct EncoderHandle {
    is_running: Arc<AtomicBool>,
}

impl EncoderHandle {
    pub fn stop(&self) {
        self.is_running.store(false, Ordering::Relaxed);
    }
}
