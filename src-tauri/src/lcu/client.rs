use super::models::{CurrentSummoner, GameflowPhase, LcuAuth};
use futures_util::{SinkExt, StreamExt};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue as WsHeaderValue;
use tracing::{debug, error, info, warn};

#[derive(Clone)]
pub struct LcuClient {
    auth: Arc<parking_lot::RwLock<Option<LcuAuth>>>,
    http_client: reqwest::Client,
    phase_sender: broadcast::Sender<GameflowPhase>,
    is_connected: Arc<AtomicBool>,
}

impl LcuClient {
    pub fn new() -> Self {
        let (phase_sender, _) = broadcast::channel(32);
        let http_client = reqwest::Client::builder()
            .danger_accept_invalid_certs(true)
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap_or_default();

        Self {
            auth: Arc::new(parking_lot::RwLock::new(None)),
            http_client,
            phase_sender,
            is_connected: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn subscribe_phase(&self) -> broadcast::Receiver<GameflowPhase> {
        self.phase_sender.subscribe()
    }

    pub fn is_connected(&self) -> bool {
        self.is_connected.load(Ordering::Relaxed)
    }

    pub fn current_auth(&self) -> Option<LcuAuth> {
        self.auth.read().clone()
    }

    pub fn set_auth(&self, auth: Option<LcuAuth>) {
        *self.auth.write() = auth;
    }

    /// Fetches the current gameflow phase via REST API
    pub async fn get_gameflow_phase(&self) -> Result<GameflowPhase, String> {
        let auth = self.auth.read().clone().ok_or("LCU not connected")?;
        let url = format!("{}/lol-gameflow/v1/gameflow-phase", auth.base_url());

        let res = self
            .http_client
            .get(&url)
            .header(AUTHORIZATION, auth.basic_auth_header())
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let text = res.text().await.map_err(|e| e.to_string())?;
        Ok(GameflowPhase::from(text.as_str()))
    }

    /// Fetches the currently logged-in summoner
    pub async fn get_current_summoner(&self) -> Result<CurrentSummoner, String> {
        let auth = self.auth.read().clone().ok_or("LCU not connected")?;
        let url = format!("{}/lol-summoner/v1/current-summoner", auth.base_url());

        let res = self
            .http_client
            .get(&url)
            .header(AUTHORIZATION, auth.basic_auth_header())
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let summoner = res.json::<CurrentSummoner>().await.map_err(|e| e.to_string())?;
        Ok(summoner)
    }

    /// Fetches End-of-Game match statistics
    pub async fn get_end_of_game_stats(&self) -> Result<Value, String> {
        let auth = self.auth.read().clone().ok_or("LCU not connected")?;
        let url = format!("{}/lol-end-of-game/v1/eog-stats-block", auth.base_url());

        let res = self
            .http_client
            .get(&url)
            .header(AUTHORIZATION, auth.basic_auth_header())
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let data = res.json::<Value>().await.map_err(|e| e.to_string())?;
        Ok(data)
    }

    /// Fetches current champ select session details
    pub async fn get_champ_select_session(&self) -> Result<Value, String> {
        let auth = self.auth.read().clone().ok_or("LCU not connected")?;
        let url = format!("{}/lol-champ-select/v1/session", auth.base_url());

        let res = self
            .http_client
            .get(&url)
            .header(AUTHORIZATION, auth.basic_auth_header())
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let data = res.json::<Value>().await.map_err(|e| e.to_string())?;
        Ok(data)
    }

    /// Connects to the LCU WAMP WebSocket and continuously listens for events
    pub async fn start_websocket_listener(self: Arc<Self>) {
        let mut retry_interval = tokio::time::interval(Duration::from_secs(3));

        loop {
            retry_interval.tick().await;

            let auth_opt = self.auth.read().clone();
            let auth = match auth_opt {
                Some(a) => a,
                None => {
                    // Try to discover LCU auth
                    if let Some(discovered) = super::connector::LcuConnector::find_auth() {
                        *self.auth.write() = Some(discovered.clone());
                        discovered
                    } else {
                        self.is_connected.store(false, Ordering::Relaxed);
                        continue;
                    }
                }
            };

            info!("Connecting to LCU WebSocket at {}", auth.ws_url());

            // Build WebSocket Request with custom TLS connector accepting self-signed certs
            let mut req = match auth.ws_url().into_client_request() {
                Ok(r) => r,
                Err(e) => {
                    error!("Invalid WebSocket URL: {e}");
                    continue;
                }
            };

            if let Ok(val) = WsHeaderValue::from_str(&auth.basic_auth_header()) {
                req.headers_mut().insert("Authorization", val);
            }

            let connector = native_tls::TlsConnector::builder()
                .danger_accept_invalid_certs(true)
                .danger_accept_invalid_hostnames(true)
                .build()
                .ok();

            let tls_connector = connector.map(tokio_tungstenite::Connector::NativeTls);

            match tokio_tungstenite::connect_async_tls_with_config(req, None, false, tls_connector).await {
                Ok((mut ws_stream, _)) => {
                    info!("LCU WebSocket connected successfully!");
                    self.is_connected.store(true, Ordering::Relaxed);

                    // Subscribe to gameflow phase events (WAMP 1.0 JSON format: [5, event_name])
                    let subscribe_msg = serde_json::json!([5, "OnJsonApiEvent_lol-gameflow/v1/gameflow-phase"]).to_string();
                    if let Err(e) = ws_stream.send(tokio_tungstenite::tungstenite::Message::Text(subscribe_msg)).await {
                        error!("Failed to subscribe to gameflow events: {e}");
                    }

                    // Also poll initial phase
                    if let Ok(phase) = self.get_gameflow_phase().await {
                        let _ = self.phase_sender.send(phase);
                    }

                    while let Some(msg_res) = ws_stream.next().await {
                        match msg_res {
                            Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                                self.handle_ws_message(&text);
                            }
                            Ok(tokio_tungstenite::tungstenite::Message::Close(_)) => {
                                warn!("LCU WebSocket closed by remote server");
                                break;
                            }
                            Err(e) => {
                                warn!("LCU WebSocket error: {e}");
                                break;
                            }
                            _ => {}
                        }
                    }

                    self.is_connected.store(false, Ordering::Relaxed);
                    *self.auth.write() = None;
                }
                Err(e) => {
                    debug!("LCU WebSocket connection failed: {e}");
                    self.is_connected.store(false, Ordering::Relaxed);
                }
            }
        }
    }

    fn handle_ws_message(&self, text: &str) {
        // Parse WAMP event: [8, "OnJsonApiEvent_lol-gameflow/v1/gameflow-phase", { "data": "InProgress", "eventType": "Update", "uri": "/lol-gameflow/v1/gameflow-phase" }]
        if let Ok(Value::Array(items)) = serde_json::from_str::<Value>(text) {
            if items.len() >= 3 && items[0] == 8 {
                let event_name = items[1].as_str().unwrap_or_default();
                if event_name.contains("gameflow-phase") {
                    if let Some(data) = items[2].get("data") {
                        let phase_str = data.as_str().unwrap_or_default();
                        let phase = GameflowPhase::from(phase_str);
                        info!("LCU Gameflow Phase updated: {:?}", phase);
                        let _ = self.phase_sender.send(phase);
                    }
                }
            }
        }
    }
}
