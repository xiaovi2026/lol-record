use crate::lcu::MatchMetadata;
use std::fs;
use std::path::{Path, PathBuf};
use tracing::info;

pub struct MetadataWriter;

impl MetadataWriter {
    /// Writes match metadata as a companion JSON sidecar alongside the MP4 recording
    pub fn write_sidecar(mp4_path: &Path, metadata: &MatchMetadata) -> Result<PathBuf, String> {
        let json_path = mp4_path.with_extension("json");
        let json_data = serde_json::to_string_pretty(metadata).map_err(|e| e.to_string())?;

        fs::write(&json_path, json_data)
            .map_err(|e| format!("Failed to write metadata sidecar: {e}"))?;
        info!("Written match metadata sidecar to {:?}", json_path);
        Ok(json_path)
    }

    /// Reads metadata sidecar if available
    pub fn read_sidecar(mp4_path: &Path) -> Option<MatchMetadata> {
        let json_path = mp4_path.with_extension("json");
        if json_path.exists() {
            if let Ok(content) = fs::read_to_string(&json_path) {
                return serde_json::from_str::<MatchMetadata>(&content).ok();
            }
        }
        None
    }
}
