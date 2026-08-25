pub mod audio;
pub mod capture;
pub mod encoder;
pub mod hardware;
pub mod manager;

pub use audio::{AudioDeviceInfo, AudioSubsystem};
pub use capture::{CaptureHandle, ScreenCaptureEngine, VideoFrame};
pub use encoder::{MediaEncoder, MediaEncoderConfig};
pub use hardware::{GpuEncoderInfo, HardwareDetector};
pub use manager::{RecorderManager, RecordingState, RecordingTelemetry};
