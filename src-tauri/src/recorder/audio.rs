use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Host, Stream};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub is_input: bool,
}

pub struct AudioSubsystem {
    host: Host,
}

impl AudioSubsystem {
    pub fn new() -> Self {
        Self {
            host: cpal::default_host(),
        }
    }

    /// Lists all available output (speakers/headphones) devices
    pub fn list_output_devices(&self) -> Vec<AudioDeviceInfo> {
        let mut devices = Vec::new();
        let default_name = self
            .host
            .default_output_device()
            .and_then(|d| d.name().ok());

        if let Ok(device_iter) = self.host.output_devices() {
            for d in device_iter {
                if let Ok(name) = d.name() {
                    let is_default = default_name
                        .as_ref()
                        .map(|def| def == &name)
                        .unwrap_or(false);
                    devices.push(AudioDeviceInfo {
                        id: name.clone(),
                        name,
                        is_default,
                        is_input: false,
                    });
                }
            }
        }
        devices
    }

    /// Lists all available input (microphone) devices
    pub fn list_input_devices(&self) -> Vec<AudioDeviceInfo> {
        let mut devices = Vec::new();
        let default_name = self.host.default_input_device().and_then(|d| d.name().ok());

        if let Ok(device_iter) = self.host.input_devices() {
            for d in device_iter {
                if let Ok(name) = d.name() {
                    let is_default = default_name
                        .as_ref()
                        .map(|def| def == &name)
                        .unwrap_or(false);
                    devices.push(AudioDeviceInfo {
                        id: name.clone(),
                        name,
                        is_default,
                        is_input: true,
                    });
                }
            }
        }
        devices
    }

    /// Starts audio recording session mixing loopback sound and microphone
    pub fn start_capture_session(
        &self,
        output_device_name: Option<String>,
        input_device_name: Option<String>,
        output_volume: f32,
        input_volume: f32,
        record_mic: bool,
        pcm_sender: mpsc::Sender<Vec<f32>>,
    ) -> Result<AudioCaptureHandle, String> {
        let is_running = Arc::new(AtomicBool::new(true));

        info!(
            "Starting Audio Capture Session (Out Vol: {:.2}, In Vol: {:.2}, Mic: {})",
            output_volume, input_volume, record_mic
        );

        // Find output device
        let out_device = if let Some(name) = output_device_name {
            self.host
                .output_devices()
                .ok()
                .and_then(|mut iter| iter.find(|d| d.name().map(|n| n == name).unwrap_or(false)))
                .or_else(|| self.host.default_output_device())
        } else {
            self.host.default_output_device()
        };

        // Find input device
        let in_device = if record_mic {
            if let Some(name) = input_device_name {
                self.host
                    .input_devices()
                    .ok()
                    .and_then(|mut iter| {
                        iter.find(|d| d.name().map(|n| n == name).unwrap_or(false))
                    })
                    .or_else(|| self.host.default_input_device())
            } else {
                self.host.default_input_device()
            }
        } else {
            None
        };

        let mut streams = Vec::new();

        // Setup Output Loopback stream
        if let Some(ref device) = out_device {
            if let Ok(config) = device.default_output_config() {
                let tx = pcm_sender.clone();
                let vol = output_volume;
                let is_run = is_running.clone();

                let stream_res = match config.sample_format() {
                    cpal::SampleFormat::F32 => device.build_input_stream(
                        &config.into(),
                        move |data: &[f32], _: &_| {
                            if !is_run.load(Ordering::Relaxed) {
                                return;
                            }
                            let processed: Vec<f32> = data.iter().map(|&s| s * vol).collect();
                            let _ = tx.try_send(processed);
                        },
                        |err| warn!("Audio output loopback stream error: {err}"),
                        None,
                    ),
                    cpal::SampleFormat::I16 => device.build_input_stream(
                        &config.into(),
                        move |data: &[i16], _: &_| {
                            if !is_run.load(Ordering::Relaxed) {
                                return;
                            }
                            let processed: Vec<f32> =
                                data.iter().map(|&s| (s as f32 / 32768.0) * vol).collect();
                            let _ = tx.try_send(processed);
                        },
                        |err| warn!("Audio output loopback stream error: {err}"),
                        None,
                    ),
                    _ => Err(cpal::BuildStreamError::DeviceNotAvailable),
                };

                if let Ok(stream) = stream_res {
                    if stream.play().is_ok() {
                        streams.push(stream);
                        info!("Loopback audio stream initialized.");
                    }
                }
            }
        }

        // Setup Input Microphone stream
        if let Some(ref device) = in_device {
            if let Ok(config) = device.default_input_config() {
                let tx = pcm_sender.clone();
                let vol = input_volume;
                let is_run = is_running.clone();

                let stream_res = match config.sample_format() {
                    cpal::SampleFormat::F32 => device.build_input_stream(
                        &config.into(),
                        move |data: &[f32], _: &_| {
                            if !is_run.load(Ordering::Relaxed) {
                                return;
                            }
                            let processed: Vec<f32> = data.iter().map(|&s| s * vol).collect();
                            let _ = tx.try_send(processed);
                        },
                        |err| warn!("Microphone stream error: {err}"),
                        None,
                    ),
                    cpal::SampleFormat::I16 => device.build_input_stream(
                        &config.into(),
                        move |data: &[i16], _: &_| {
                            if !is_run.load(Ordering::Relaxed) {
                                return;
                            }
                            let processed: Vec<f32> =
                                data.iter().map(|&s| (s as f32 / 32768.0) * vol).collect();
                            let _ = tx.try_send(processed);
                        },
                        |err| warn!("Microphone stream error: {err}"),
                        None,
                    ),
                    _ => Err(cpal::BuildStreamError::DeviceNotAvailable),
                };

                if let Ok(stream) = stream_res {
                    if stream.play().is_ok() {
                        streams.push(stream);
                        info!("Microphone audio stream initialized.");
                    }
                }
            }
        }

        Ok(AudioCaptureHandle {
            is_running,
            _streams: streams,
        })
    }
}

pub struct AudioCaptureHandle {
    is_running: Arc<AtomicBool>,
    _streams: Vec<Stream>,
}

impl AudioCaptureHandle {
    pub fn stop(&self) {
        self.is_running.store(false, Ordering::Relaxed);
    }
}
