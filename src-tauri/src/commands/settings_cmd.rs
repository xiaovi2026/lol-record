use crate::config::AppSettings;
use crate::exporter::NamingFormatter;
use crate::lcu::MatchMetadata;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn get_settings(settings: State<'_, Arc<parking_lot::RwLock<AppSettings>>>) -> AppSettings {
    settings.read().clone()
}

#[tauri::command]
pub fn save_settings(
    new_settings: AppSettings,
    settings: State<'_, Arc<parking_lot::RwLock<AppSettings>>>,
) -> Result<(), String> {
    new_settings.save()?;
    *settings.write() = new_settings;
    Ok(())
}

#[tauri::command]
pub fn test_naming_template(template: String) -> String {
    let mock_meta = MatchMetadata {
        game_id: Some(123456789),
        game_mode: "CLASSIC".to_string(),
        queue_id: 420,
        queue_name: "RankedSolo".to_string(),
        champion_id: 266,
        champion_name: "Aatrox".to_string(),
        champion_key: "Aatrox".to_string(),
        kills: 12,
        deaths: 2,
        assists: 5,
        win: true,
        game_duration_seconds: 1845,
        start_time: chrono::Local::now(),
        end_time: Some(chrono::Local::now()),
        highlights: Vec::new(),
    };

    NamingFormatter::format(&template, &mock_meta)
}
