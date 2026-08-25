pub mod commands;
pub mod config;
pub mod exporter;
pub mod lcu;
pub mod recorder;

use commands::*;
use config::AppSettings;
use exporter::{MetadataWriter, NamingFormatter, StorageManager};
use lcu::{GameflowPhase, LcuClient, LiveClientPoller, MatchMetadata};
use recorder::RecorderManager;
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};
use tracing::{error, info};

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .init();

    info!("Starting LoL Record daemon...");

    let settings = Arc::new(parking_lot::RwLock::new(AppSettings::load()));
    let lcu_client = Arc::new(LcuClient::new());
    let live_poller = Arc::new(LiveClientPoller::new());
    let recorder_manager = Arc::new(RecorderManager::new());

    // Spawn LCU background listener
    let lcu_listener = lcu_client.clone();
    tokio::spawn(async move {
        lcu_listener.start_websocket_listener().await;
    });

    // Spawn Recorder telemetry loop
    let telemetry_mgr = recorder_manager.clone();
    tokio::spawn(async move {
        telemetry_mgr.start_telemetry_loop().await;
    });

    // Spawn Automated Lifecycle Orchestrator
    let orch_settings = settings.clone();
    let orch_lcu = lcu_client.clone();
    let orch_live = live_poller.clone();
    let orch_recorder = recorder_manager.clone();

    tokio::spawn(async move {
        run_lifecycle_orchestrator(orch_settings, orch_lcu, orch_live, orch_recorder).await;
    });

    let app_settings = settings.clone();
    let app_lcu = lcu_client.clone();
    let app_live = live_poller.clone();
    let app_recorder = recorder_manager.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(app_settings)
        .manage(app_lcu)
        .manage(app_live)
        .manage(app_recorder)
        .setup(|app| {
            let handle = app.handle().clone();

            // Setup System Tray
            let show_item = MenuItem::with_id(app, "show", "打开主面板", true, None::<&str>)?;
            let folder_item =
                MenuItem::with_id(app, "folder", "打开录像文件夹", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &folder_item, &quit_item])?;

            let default_icon = app.default_window_icon().cloned();
            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("LoL Record - 英雄联盟无感录像系统");

            if let Some(icon) = default_icon {
                tray_builder = tray_builder.icon(icon);
            }

            let _tray = tray_builder
                .on_menu_event(move |_app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "folder" => {
                        let current_settings = AppSettings::load();
                        let dir = current_settings.storage.output_dir;
                        #[cfg(target_os = "windows")]
                        let _ = std::process::Command::new("explorer").arg(dir).spawn();
                        #[cfg(not(target_os = "windows"))]
                        let _ = std::process::Command::new("xdg-open").arg(dir).spawn();
                    }
                    "quit" => {
                        std::process::exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Intercept close event and minimize to tray
                let current_settings = AppSettings::load();
                if current_settings.automation.minimize_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_lcu_status,
            get_live_highlights,
            start_manual_recording,
            stop_manual_recording,
            get_recorder_telemetry,
            get_gpu_encoder_info,
            get_settings,
            save_settings,
            test_naming_template,
            get_audio_devices,
            get_recordings,
            get_storage_usage,
            delete_recording,
            open_file_in_folder,
            open_recordings_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn run_lifecycle_orchestrator(
    settings: Arc<parking_lot::RwLock<AppSettings>>,
    lcu: Arc<LcuClient>,
    live: Arc<LiveClientPoller>,
    recorder: Arc<RecorderManager>,
) {
    let mut phase_rx = lcu.subscribe_phase();
    let mut is_auto_recording = false;
    let mut match_start_time = chrono::Local::now();

    info!("LCU Lifecycle Orchestrator active.");

    loop {
        tokio::select! {
            phase_res = phase_rx.recv() => {
                if let Ok(phase) = phase_res {
                    info!("Lifecycle Orchestrator received phase: {:?}", phase);
                    let cfg = settings.read().clone();

                    match phase {
                        GameflowPhase::InProgress => {
                            if cfg.automation.auto_record && !is_auto_recording {
                                info!("Game InProgress detected: starting seamless recording...");
                                match_start_time = chrono::Local::now();
                                live.reset().await;

                                match recorder.start_recording(&cfg, None).await {
                                    Ok(_) => {
                                        is_auto_recording = true;
                                        info!("Automatic match recording started!");
                                    }
                                    Err(e) => {
                                        error!("Failed to auto start recording: {e}");
                                    }
                                }
                            }
                        }
                        GameflowPhase::WaitingForStats | GameflowPhase::PreEndOfGame | GameflowPhase::EndOfGame => {
                            if is_auto_recording {
                                info!("Game conclusion detected ({:?}): finalizing recording...", phase);
                                is_auto_recording = false;

                                match recorder.stop_recording().await {
                                    Ok(temp_path) => {
                                        if cfg.automation.auto_export {
                                            handle_auto_export(
                                                temp_path,
                                                &cfg,
                                                &lcu,
                                                &live,
                                                match_start_time,
                                            ).await;
                                        }
                                    }
                                    Err(e) => {
                                        error!("Failed to stop recording cleanly: {e}");
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ = tokio::time::sleep(tokio::time::Duration::from_secs(3)) => {
                if is_auto_recording {
                    // Poll in-game live events
                    let _ = live.poll_events(None).await;
                }
            }
        }
    }
}

async fn handle_auto_export(
    temp_path: std::path::PathBuf,
    settings: &AppSettings,
    lcu: &LcuClient,
    live: &LiveClientPoller,
    start_time: chrono::DateTime<chrono::Local>,
) {
    info!(
        "Starting auto-export and metadata processing for {:?}",
        temp_path
    );

    // Wait briefly for LCU end-of-game stats block to be ready
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    let eog_stats = lcu.get_end_of_game_stats().await.ok();
    let highlights = live.get_highlights().await;

    let mut metadata = MatchMetadata {
        game_id: None,
        game_mode: "CLASSIC".to_string(),
        queue_id: 420,
        queue_name: "RankedSolo".to_string(),
        champion_id: 0,
        champion_name: "Champion".to_string(),
        champion_key: "Champion".to_string(),
        kills: 0,
        deaths: 0,
        assists: 0,
        win: true,
        game_duration_seconds: (chrono::Local::now() - start_time).num_seconds() as u32,
        start_time,
        end_time: Some(chrono::Local::now()),
        highlights,
    };

    if let Some(stats) = eog_stats {
        if let Some(game_id) = stats.get("gameId").and_then(|v| v.as_i64()) {
            metadata.game_id = Some(game_id);
        }
        if let Some(mode) = stats.get("gameMode").and_then(|v| v.as_str()) {
            metadata.game_mode = mode.to_string();
        }
        if let Some(q_name) = stats.get("queueName").and_then(|v| v.as_str()) {
            metadata.queue_name = q_name.to_string();
        }
        if let Some(local_player) = stats.get("localPlayer") {
            if let Some(k) = local_player
                .get("stats")
                .and_then(|s| s.get("CHAMPIONS_KILLED"))
                .and_then(|v| v.as_i64())
            {
                metadata.kills = k as i32;
            }
            if let Some(d) = local_player
                .get("stats")
                .and_then(|s| s.get("NUM_DEATHS"))
                .and_then(|v| v.as_i64())
            {
                metadata.deaths = d as i32;
            }
            if let Some(a) = local_player
                .get("stats")
                .and_then(|s| s.get("ASSISTS"))
                .and_then(|v| v.as_i64())
            {
                metadata.assists = a as i32;
            }
            if let Some(win) = local_player
                .get("stats")
                .and_then(|s| s.get("WIN"))
                .and_then(|v| v.as_bool())
            {
                metadata.win = win;
            }
            if let Some(champ) = local_player.get("championName").and_then(|v| v.as_str()) {
                metadata.champion_name = champ.to_string();
            }
        }
    }

    let final_filename = NamingFormatter::format(&settings.storage.filename_template, &metadata);
    let final_path = temp_path
        .parent()
        .unwrap_or(&temp_path)
        .join(final_filename);

    // Rename temp file to final exported name
    if let Err(e) = std::fs::rename(&temp_path, &final_path) {
        error!(
            "Failed to rename temp file {:?} to {:?}: {e}",
            temp_path, final_path
        );
    } else {
        info!("Exported match recording to {:?}", final_path);
        let _ = MetadataWriter::write_sidecar(&final_path, &metadata);
    }

    // Run auto storage cleanup
    StorageManager::run_auto_cleanup(settings);
}
