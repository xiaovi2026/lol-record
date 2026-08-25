use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tracing::{error, info};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoSettings {
    /// Target resolution preset: "source", "2160p", "1440p", "1080p", "720p"
    pub resolution: String,
    /// Target framerate: 30, 60, 120
    pub fps: u32,
    /// Video bitrate in kbps (e.g. 8000 for 1080p60)
    pub bitrate_kbps: u32,
    /// Hardware encoder choice: "auto", "nvenc", "amf", "qsv", "software"
    pub encoder: String,
    /// Codec format: "h264", "hevc", "av1"
    pub codec: String,
}

impl Default for VideoSettings {
    fn default() -> Self {
        Self {
            resolution: "1080p".to_string(),
            fps: 60,
            bitrate_kbps: 8000,
            encoder: "auto".to_string(),
            codec: "h264".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSettings {
    /// Selected output (speaker/headphones loopback) device name or id
    pub output_device: Option<String>,
    /// Selected input (microphone) device name or id
    pub input_device: Option<String>,
    /// Output audio volume multiplier (0.0 to 2.0, default 1.0)
    pub output_volume: f32,
    /// Microphone volume multiplier (0.0 to 2.0, default 0.8)
    pub input_volume: f32,
    /// Whether to record microphone input
    pub record_mic: bool,
}

impl Default for AudioSettings {
    fn default() -> Self {
        Self {
            output_device: None,
            input_device: None,
            output_volume: 1.0,
            input_volume: 0.8,
            record_mic: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageSettings {
    /// Directory where exported MP4 match recordings are stored
    pub output_dir: String,
    /// Filename pattern, e.g. "{date}_{queue}_{champion}_{kda}_{result}.mp4"
    pub filename_template: String,
    /// Maximum disk space quota in Gigabytes
    pub max_storage_gb: u64,
    /// Whether to automatically delete older recordings when quota is exceeded
    pub auto_cleanup: bool,
    /// Max retention in days (0 means unlimited)
    pub retention_days: u32,
}

impl Default for StorageSettings {
    fn default() -> Self {
        let default_dir = directories::UserDirs::new()
            .and_then(|dirs| dirs.video_dir().map(|p| p.join("LoL Recordings")))
            .unwrap_or_else(|| PathBuf::from("./recordings"))
            .to_string_lossy()
            .to_string();

        Self {
            output_dir: default_dir,
            filename_template: "{date}_{queue}_{champion}_{kda}_{result}.mp4".to_string(),
            max_storage_gb: 50,
            auto_cleanup: true,
            retention_days: 30,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationSettings {
    /// Automatically start recording when match enters InProgress phase
    pub auto_record: bool,
    /// Automatically export, format filename and embed metadata upon match conclusion
    pub auto_export: bool,
    /// Auto-launch on Windows system startup
    pub auto_start_boot: bool,
    /// Minimize to system tray when main window is closed
    pub minimize_to_tray: bool,
    /// Start silently in background tray on launch
    pub start_minimized: bool,
    /// Push Windows desktop notification on export completion
    pub notify_on_export: bool,
}

impl Default for AutomationSettings {
    fn default() -> Self {
        Self {
            auto_record: true,
            auto_export: true,
            auto_start_boot: true,
            minimize_to_tray: true,
            start_minimized: false,
            notify_on_export: true,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub video: VideoSettings,
    pub audio: AudioSettings,
    pub storage: StorageSettings,
    pub automation: AutomationSettings,
}

impl AppSettings {
    pub fn config_path() -> PathBuf {
        directories::ProjectDirs::from("com", "lolrecord", "app")
            .map(|dirs| dirs.config_dir().join("settings.json"))
            .unwrap_or_else(|| PathBuf::from("settings.json"))
    }

    pub fn load() -> Self {
        let path = Self::config_path();
        if path.exists() {
            match fs::read_to_string(&path) {
                Ok(content) => match serde_json::from_str::<AppSettings>(&content) {
                    Ok(settings) => {
                        info!("Loaded settings from {:?}", path);
                        return settings;
                    }
                    Err(e) => {
                        error!("Failed to parse settings JSON: {e}, falling back to defaults");
                    }
                },
                Err(e) => {
                    error!("Failed to read settings file: {e}");
                }
            }
        }
        let default_settings = Self::default();
        let _ = default_settings.save();
        default_settings
    }

    pub fn save(&self) -> Result<(), String> {
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| e.to_string())?;
        info!("Saved settings to {:?}", path);
        Ok(())
    }

    pub fn ensure_output_dir(&self) -> Result<PathBuf, String> {
        let path = Path::new(&self.storage.output_dir);
        if !path.exists() {
            fs::create_dir_all(path)
                .map_err(|e| format!("Failed to create output directory: {e}"))?;
        }
        Ok(path.to_path_buf())
    }
}
