mod lcu;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use std::sync::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Default)]
pub struct AnalysisState(pub Mutex<Option<AnalysisInitData>>);

#[derive(Clone, Serialize, Deserialize)]
pub struct AnalysisInitData {
    pub video_path: String,
    pub game_id: Option<String>,
}

#[tauri::command]
async fn get_lcu_status() -> lcu::LcuStatusResult {
    lcu::get_lcu_status_detail()
}

#[tauri::command]
async fn restart_as_admin(app: AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    {
        let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_path = current_exe.to_string_lossy().to_string();
        
        let status = std::process::Command::new("powershell")
            .args(&[
                "-NoProfile",
                "-WindowStyle", "Hidden",
                "-Command",
                &format!("Start-Process -FilePath '{}' -Verb RunAs", exe_path),
            ])
            .status()
            .map_err(|e| e.to_string())?;

        if status.success() {
            app.exit(0);
            Ok(())
        } else {
            Err("请求管理员权限失败，请手动右键以管理员身份运行".to_string())
        }
    }

    #[cfg(not(windows))]
    {
        let _ = app;
        Err("当前系统不支持该操作".to_string())
    }
}

#[tauri::command]
async fn select_video_file() -> Option<String> {
    let file = rfd::FileDialog::new()
        .add_filter("视频文件 (*.mp4;*.webm;*.mkv;*.flv;*.mov;*.avi)", &["mp4", "webm", "mkv", "flv", "mov", "avi"])
        .pick_file();
    file.map(|p| p.to_string_lossy().into_owned())
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

#[tauri::command]
async fn open_analysis_window(
    app: AppHandle,
    state: tauri::State<'_, AnalysisState>,
    video_path: String,
    game_id: Option<String>,
) -> Result<(), String> {
    let init_data = AnalysisInitData {
        video_path,
        game_id,
    };

    // Store current analysis init data
    *state.0.lock().map_err(|e| e.to_string())? = Some(init_data.clone());

    if let Some(window) = app.get_webview_window("analysis") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = tauri::Emitter::emit(&window, "reload-analysis", &init_data);
    } else {
        let _window = WebviewWindowBuilder::new(
            &app,
            "analysis",
            WebviewUrl::App("analysis.html".into()),
        )
        .title("LoL 对局录像分析")
        .inner_size(1280.0, 800.0)
        .min_inner_size(960.0, 600.0)
        .resizable(true)
        .maximizable(true)
        .build()
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn get_analysis_init_data(
    state: tauri::State<'_, AnalysisState>,
) -> Result<Option<AnalysisInitData>, String> {
    Ok(state.0.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
fn translate_champion(name: String) -> String {
    lcu::translate_champion(&name).to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AnalysisState::default())
        .invoke_handler(tauri::generate_handler![
            get_lcu_status,
            restart_as_admin,
            request_lcu,
            select_video_file,
            open_analysis_window,
            get_analysis_init_data,
            translate_champion,
            open_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
