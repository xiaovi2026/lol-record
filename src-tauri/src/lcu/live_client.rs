use super::models::{HighlightMarker, LiveEventData};
use serde_json::Value;
use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

pub struct LiveClientPoller {
    http_client: reqwest::Client,
    processed_event_ids: Arc<RwLock<HashSet<i32>>>,
    highlights: Arc<RwLock<Vec<HighlightMarker>>>,
}

impl LiveClientPoller {
    pub fn new() -> Self {
        let http_client = reqwest::Client::builder()
            .danger_accept_invalid_certs(true)
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap_or_default();

        Self {
            http_client,
            processed_event_ids: Arc::new(RwLock::new(HashSet::new())),
            highlights: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub async fn reset(&self) {
        self.processed_event_ids.write().await.clear();
        self.highlights.write().await.clear();
    }

    pub async fn get_highlights(&self) -> Vec<HighlightMarker> {
        self.highlights.read().await.clone()
    }

    /// Polls Live Client API on port 2999 for match events
    pub async fn poll_events(&self, current_player_name: Option<&str>) -> Result<Vec<HighlightMarker>, String> {
        let url = "https://127.0.0.1:2999/liveclientdata/eventdata";

        let res = match self.http_client.get(url).send().await {
            Ok(r) => r,
            Err(e) => return Err(format!("Live Client API not accessible: {e}")),
        };

        let json = res.json::<Value>().await.map_err(|e| e.to_string())?;
        let events = json.get("Events").and_then(|e| e.as_array());

        let mut new_highlights = Vec::new();

        if let Some(event_list) = events {
            for item in event_list {
                if let Ok(event) = serde_json::from_value::<LiveEventData>(item.clone()) {
                    let event_id = event.event_id.unwrap_or_else(|| (event.event_time * 100.0) as i32);
                    
                    let mut processed = self.processed_event_ids.write().await;
                    if processed.contains(&event_id) {
                        continue;
                    }
                    processed.insert(event_id);

                    if let Some(marker) = Self::parse_event_marker(&event, current_player_name) {
                        info!("Match Highlight Detected: {} at {:.1}s", marker.description, marker.timestamp_sec);
                        new_highlights.push(marker.clone());
                        self.highlights.write().await.push(marker);
                    }
                }
            }
        }

        Ok(new_highlights)
    }

    fn parse_event_marker(event: &LiveEventData, current_player: Option<&str>) -> Option<HighlightMarker> {
        let is_me = |name: &Option<String>| {
            if let (Some(me), Some(n)) = (current_player, name) {
                me.eq_ignore_ascii_case(n)
            } else {
                false
            }
        };

        match event.event_name.as_str() {
            "ChampionKill" => {
                let killer = event.killer_name.as_deref().unwrap_or("Unknown");
                let victim = event.victim_name.as_deref().unwrap_or("Unknown");
                let desc = if is_me(&event.killer_name) {
                    format!("You eliminated {}", victim)
                } else if is_me(&event.victim_name) {
                    format!("Eliminated by {}", killer)
                } else {
                    format!("{} eliminated {}", killer, victim)
                };

                Some(HighlightMarker {
                    timestamp_sec: event.event_time,
                    event_name: event.event_name.clone(),
                    event_type: "Kill".to_string(),
                    description: desc,
                    killer_name: event.killer_name.clone(),
                    victim_name: event.victim_name.clone(),
                })
            }
            "Multikill" => {
                let streak = event.kill_streak.unwrap_or(2);
                let streak_name = match streak {
                    2 => "Double Kill",
                    3 => "Triple Kill",
                    4 => "Quadra Kill",
                    5 => "Penta Kill",
                    _ => "Multi Kill",
                };
                let killer = event.killer_name.as_deref().unwrap_or("Unknown");
                Some(HighlightMarker {
                    timestamp_sec: event.event_time,
                    event_name: event.event_name.clone(),
                    event_type: "Multikill".to_string(),
                    description: format!("{} scored a {}!", killer, streak_name),
                    killer_name: event.killer_name.clone(),
                    victim_name: None,
                })
            }
            "BaronKill" => Some(HighlightMarker {
                timestamp_sec: event.event_time,
                event_name: event.event_name.clone(),
                event_type: "Baron".to_string(),
                description: format!("Baron Nashor secured by {}", event.killer_name.as_deref().unwrap_or("Team")),
                killer_name: event.killer_name.clone(),
                victim_name: None,
            }),
            "DragonKill" => Some(HighlightMarker {
                timestamp_sec: event.event_time,
                event_name: event.event_name.clone(),
                event_type: "Dragon".to_string(),
                description: format!("{} Dragon secured by {}", event.dragon_type.as_deref().unwrap_or("Elemental"), event.killer_name.as_deref().unwrap_or("Team")),
                killer_name: event.killer_name.clone(),
                victim_name: None,
            }),
            "Ace" => Some(HighlightMarker {
                timestamp_sec: event.event_time,
                event_name: event.event_name.clone(),
                event_type: "Ace".to_string(),
                description: format!("ACE! Secured by {}", event.acer.as_deref().unwrap_or("Team")),
                killer_name: event.acer.clone(),
                victim_name: None,
            }),
            _ => None,
        }
    }
}
