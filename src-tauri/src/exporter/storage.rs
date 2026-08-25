use crate::config::AppSettings;
use crate::exporter::metadata::MetadataWriter;
use crate::lcu::MatchMetadata;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tracing::{info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingItem {
    pub file_path: String,
    pub file_name: String,
    pub file_size_bytes: u64,
    pub modified_time: i64,
    pub metadata: Option<MatchMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsage {
    pub total_recordings_bytes: u64,
    pub recording_count: usize,
    pub max_quota_bytes: u64,
}

pub struct StorageManager;

impl StorageManager {
    /// Scans the output directory and returns all recordings ordered by newest first
    pub fn list_recordings(output_dir: &str) -> Vec<RecordingItem> {
        let mut items = Vec::new();
        let path = Path::new(output_dir);

        if !path.exists() {
            return items;
        }

        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if entry_path.is_file() {
                    let ext = entry_path.extension().and_then(|e| e.to_str()).unwrap_or_default();
                    if ext.eq_ignore_ascii_case("mp4") {
                        let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        let modified_time = entry
                            .metadata()
                            .and_then(|m| m.modified())
                            .ok()
                            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                            .map(|d| d.as_secs() as i64)
                            .unwrap_or(0);

                        let metadata = MetadataWriter::read_sidecar(&entry_path);

                        items.push(RecordingItem {
                            file_path: entry_path.to_string_lossy().to_string(),
                            file_name: entry_path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                            file_size_bytes: file_size,
                            modified_time,
                            metadata,
                        });
                    }
                }
            }
        }

        // Sort descending by modified time (newest first)
        items.sort_by(|a, b| b.modified_time.cmp(&a.modified_time));
        items
    }

    /// Calculates storage usage
    pub fn get_storage_usage(settings: &AppSettings) -> StorageUsage {
        let recordings = Self::list_recordings(&settings.storage.output_dir);
        let total_bytes: u64 = recordings.iter().map(|r| r.file_size_bytes).sum();
        let max_quota = settings.storage.max_storage_gb * 1024 * 1024 * 1024;

        StorageUsage {
            total_recordings_bytes: total_bytes,
            recording_count: recordings.len(),
            max_quota_bytes: max_quota,
        }
    }

    /// Deletes a recording and its companion metadata sidecar
    pub fn delete_recording(file_path: &str) -> Result<(), String> {
        let path = Path::new(file_path);
        if path.exists() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
            let sidecar = path.with_extension("json");
            if sidecar.exists() {
                let _ = fs::remove_file(sidecar);
            }
            info!("Deleted recording file {:?}", path);
        }
        Ok(())
    }

    /// Automatically cleans up older recordings if quota or retention policy is exceeded
    pub fn run_auto_cleanup(settings: &AppSettings) {
        if !settings.storage.auto_cleanup {
            return;
        }

        let mut recordings = Self::list_recordings(&settings.storage.output_dir);
        let max_quota = settings.storage.max_storage_gb * 1024 * 1024 * 1024;
        let mut total_bytes: u64 = recordings.iter().map(|r| r.file_size_bytes).sum();

        let now_sec = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let retention_sec = (settings.storage.retention_days as i64) * 86400;

        // Delete from oldest first
        recordings.sort_by(|a, b| a.modified_time.cmp(&b.modified_time));

        for item in recordings {
            let is_expired = settings.storage.retention_days > 0 && (now_sec - item.modified_time) > retention_sec;
            let is_over_quota = total_bytes > max_quota;

            if is_expired || is_over_quota {
                info!("Auto-cleanup: removing older recording {}", item.file_name);
                if Self::delete_recording(&item.file_path).is_ok() {
                    total_bytes = total_bytes.saturating_sub(item.file_size_bytes);
                }
            }
        }
    }
}
