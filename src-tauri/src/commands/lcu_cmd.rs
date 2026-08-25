use crate::lcu::{CurrentSummoner, GameflowPhase, HighlightMarker, LcuAuth, LcuClient, LiveClientPoller};
use serde::Serialize;
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LcuStatusDto {
    pub is_connected: bool,
    pub phase: String,
    pub auth: Option<LcuAuth>,
    pub summoner: Option<CurrentSummoner>,
}

#[tauri::command]
pub async fn get_lcu_status(
    lcu_client: State<'_, Arc<LcuClient>>,
) -> Result<LcuStatusDto, String> {
    let is_connected = lcu_client.is_connected();
    let auth = lcu_client.current_auth();
    let phase = if is_connected {
        lcu_client.get_gameflow_phase().await.unwrap_or(GameflowPhase::None).to_string()
    } else {
        "None".to_string()
    };

    let summoner = if is_connected {
        lcu_client.get_current_summoner().await.ok()
    } else {
        None
    };

    Ok(LcuStatusDto {
        is_connected,
        phase,
        auth,
        summoner,
    })
}

#[tauri::command]
pub async fn get_live_highlights(
    live_poller: State<'_, Arc<LiveClientPoller>>,
) -> Result<Vec<HighlightMarker>, String> {
    Ok(live_poller.get_highlights().await)
}
