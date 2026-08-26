mod lcu;
mod audio;
mod record;

use tauri::{
    menu::{MenuBuilder, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};
use std::sync::atomic::{AtomicBool, Ordering};

static MONITORING_ACTIVE: AtomicBool = AtomicBool::new(true);

#[tauri::command]
async fn get_audio_devices() -> Result<serde_json::Value, String> {
    let inputs = audio::get_input_devices();
    let outputs = audio::get_output_devices();
    Ok(serde_json::json!({
        "inputs": inputs,
        "outputs": outputs
    }))
}

#[tauri::command]
async fn get_lcu_status() -> Option<lcu::LcuCredentials> {
    lcu::get_lcu_credentials()
}

#[tauri::command]
async fn start_manual_record(
    path: String,
    width: u32,
    height: u32,
    bitrate_mbps: u32,
    audio_output: String,
    audio_input: String,
) -> Result<(), String> {
    record::start_recording(&path, width, height, bitrate_mbps, &audio_output, &audio_input)
}

#[tauri::command]
async fn stop_manual_record() -> Result<String, String> {
    record::stop_recording()
}

#[tauri::command]
async fn select_directory() -> Option<String> {
    let dir = rfd::FileDialog::new()
        .pick_folder();
    dir.map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
async fn open_path(path: String) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(&["/c", "start", "", &path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    std::fs::rename(old_path, new_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn request_lcu(
    method: String,
    endpoint: String,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    if let Some(creds) = lcu::get_lcu_credentials() {
        let client = reqwest::Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| e.to_string())?;
            
        let url = format!("https://127.0.0.1:{}{}", creds.port, endpoint);
        let mut req = match method.to_uppercase().as_str() {
            "POST" => client.post(&url),
            "PUT" => client.put(&url),
            _ => client.get(&url),
        };
        
        req = req.basic_auth("riot", Some(&creds.token));
        
        if let Some(b) = body {
            req = req.json(&b);
        }
        
        let resp = req.send().await.map_err(|e| e.to_string())?;
        let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        Ok(json)
    } else {
        Err("LCU client not running".to_string())
    }
}

// Background LCU game state poller
fn start_lcu_monitor(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .unwrap();
            
        let mut is_recording = false;
        
        while MONITORING_ACTIVE.load(Ordering::Relaxed) {
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
            
            if let Some(creds) = lcu::get_lcu_credentials() {
                let url = format!("https://127.0.0.1:{}/lol-gameflow/v1/gameflow-phase", creds.port);
                let response = client.get(&url)
                    .basic_auth("riot", Some(&creds.token))
                    .send()
                    .await;
                
                if let Ok(resp) = response {
                    if let Ok(phase) = resp.text().await {
                        let clean_phase = phase.trim_matches('"');
                        let app_ref = app.clone();
                        
                        if clean_phase == "InProgress" && !is_recording {
                            let _ = app_ref.emit("lcu-game-start", ());
                            is_recording = true;
                        } else if clean_phase != "InProgress" && is_recording {
                            let _ = app_ref.emit("lcu-game-end", ());
                            is_recording = false;
                        }
                    }
                }
            } else {
                if is_recording {
                    let _ = record::stop_recording();
                    is_recording = false;
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .setup(|app| {
            // Build the tray menu
            let show_i = MenuItem::with_id(app, "show", "显示主界面", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出应用", true, None::<&str>)?;
            
            let menu = MenuBuilder::new(app)
                .item(&show_i)
                .item(&quit_i)
                .build()?;
                
            let icon = app.default_window_icon().expect("window icon not configured").clone();
            
            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .icon(icon)
                .on_menu_event(|app_handle, event| {
                    if event.id == "show" {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    } else if event.id == "quit" {
                        let _ = record::stop_recording();
                        app_handle.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;
                
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });
            }
            
            start_lcu_monitor(app.handle().clone());
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_audio_devices,
            get_lcu_status,
            start_manual_record,
            stop_manual_record,
            request_lcu,
            rename_file,
            select_directory,
            open_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
