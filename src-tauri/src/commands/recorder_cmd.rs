use crate::config::AppSettings;
use crate::recorder::{GpuEncoderInfo, HardwareDetector, RecorderManager, RecordingTelemetry};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn start_manual_recording(
    recorder: State<'_, Arc<RecorderManager>>,
    settings: State<'_, Arc<parking_lot::RwLock<AppSettings>>>,
) -> Result<String, String> {
    let current_settings = settings.read().clone();
    let path = recorder.start_recording(&current_settings, None).await?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn stop_manual_recording(
    recorder: State<'_, Arc<RecorderManager>>,
) -> Result<String, String> {
    let path = recorder.stop_recording().await?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_recorder_telemetry(
    recorder: State<'_, Arc<RecorderManager>>,
    settings: State<'_, Arc<parking_lot::RwLock<AppSettings>>>,
) -> Result<RecordingTelemetry, String> {
    let current_settings = settings.read().clone();
    let state = recorder.current_state();

    Ok(RecordingTelemetry {
        state,
        elapsed_seconds: 0,
        recorded_frames: 0,
        recorded_bytes: 0,
        fps: current_settings.video.fps,
        bitrate_kbps: current_settings.video.bitrate_kbps,
        resolution: current_settings.video.resolution.clone(),
        output_file_path: None,
    })
}

#[tauri::command]
pub fn get_gpu_encoder_info() -> GpuEncoderInfo {
    HardwareDetector::detect()
}
