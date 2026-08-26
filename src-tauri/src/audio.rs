use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct AudioDevice {
    pub name: String,
    pub is_default: bool,
}

pub fn get_input_devices() -> Vec<AudioDevice> {
    let host = cpal::default_host();
    let default_name = host.default_input_device().and_then(|d| d.name().ok());
    
    let mut devices = Vec::new();
    if let Ok(input_devices) = host.input_devices() {
        for device in input_devices {
            if let Ok(name) = device.name() {
                let is_default = Some(&name) == default_name.as_ref();
                devices.push(AudioDevice { name, is_default });
            }
        }
    }
    devices
}

pub fn get_output_devices() -> Vec<AudioDevice> {
    let host = cpal::default_host();
    let default_name = host.default_output_device().and_then(|d| d.name().ok());
    
    let mut devices = Vec::new();
    if let Ok(output_devices) = host.output_devices() {
        for device in output_devices {
            if let Ok(name) = device.name() {
                let is_default = Some(&name) == default_name.as_ref();
                devices.push(AudioDevice { name, is_default });
            }
        }
    }
    devices
}
