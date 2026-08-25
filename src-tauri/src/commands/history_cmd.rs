use crate::config::AppSettings;
use crate::exporter::{RecordingItem, StorageManager, StorageUsage};
use std::path::Path;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn get_recordings(
    settings: State<'_, Arc<parking_lot::RwLock<AppSettings>>>,
) -> Vec<RecordingItem> {
    let current_settings = settings.read().clone();
    StorageManager::list_recordings(&current_settings.storage.output_dir)
}

#[tauri::command]
pub fn get_storage_usage(
    settings: State<'_, Arc<parking_lot::RwLock<AppSettings>>>,
) -> StorageUsage {
    let current_settings = settings.read().clone();
    StorageManager::get_storage_usage(&current_settings)
}

#[tauri::command]
pub fn delete_recording(file_path: String) -> Result<(), String> {
    StorageManager::delete_recording(&file_path)
}

#[tauri::command]
pub fn open_file_in_folder(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&file_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let path = Path::new(&file_path);
        let dir = path.parent().unwrap_or(path);
        std::process::Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_recordings_folder(
    settings: State<'_, Arc<parking_lot::RwLock<AppSettings>>>,
) -> Result<(), String> {
    let current_settings = settings.read().clone();
    let dir = &current_settings.storage.output_dir;

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
