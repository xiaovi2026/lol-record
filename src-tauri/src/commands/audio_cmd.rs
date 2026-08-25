use crate::recorder::{AudioDeviceInfo, AudioSubsystem};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevicesDto {
    pub output_devices: Vec<AudioDeviceInfo>,
    pub input_devices: Vec<AudioDeviceInfo>,
}

#[tauri::command]
pub fn get_audio_devices() -> AudioDevicesDto {
    let audio = AudioSubsystem::new();
    AudioDevicesDto {
        output_devices: audio.list_output_devices(),
        input_devices: audio.list_input_devices(),
    }
}
