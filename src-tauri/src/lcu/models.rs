use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum GameflowPhase {
    None,
    Lobby,
    Matchmaking,
    ReadyCheck,
    ChampSelect,
    InProgress,
    WaitingForStats,
    PreEndOfGame,
    EndOfGame,
    TerminatedInError,
    Unknown(String),
}

impl From<&str> for GameflowPhase {
    fn from(s: &str) -> Self {
        match s {
            "\"None\"" | "None" => GameflowPhase::None,
            "\"Lobby\"" | "Lobby" => GameflowPhase::Lobby,
            "\"Matchmaking\"" | "Matchmaking" => GameflowPhase::Matchmaking,
            "\"ReadyCheck\"" | "ReadyCheck" => GameflowPhase::ReadyCheck,
            "\"ChampSelect\"" | "ChampSelect" => GameflowPhase::ChampSelect,
            "\"InProgress\"" | "InProgress" => GameflowPhase::InProgress,
            "\"WaitingForStats\"" | "WaitingForStats" => GameflowPhase::WaitingForStats,
            "\"PreEndOfGame\"" | "PreEndOfGame" => GameflowPhase::PreEndOfGame,
            "\"EndOfGame\"" | "EndOfGame" => GameflowPhase::EndOfGame,
            "\"TerminatedInError\"" | "TerminatedInError" => GameflowPhase::TerminatedInError,
            other => GameflowPhase::Unknown(other.trim_matches('"').to_string()),
        }
    }
}

impl ToString for GameflowPhase {
    fn to_string(&self) -> String {
        match self {
            GameflowPhase::None => "None".to_string(),
            GameflowPhase::Lobby => "Lobby".to_string(),
            GameflowPhase::Matchmaking => "Matchmaking".to_string(),
            GameflowPhase::ReadyCheck => "ReadyCheck".to_string(),
            GameflowPhase::ChampSelect => "ChampSelect".to_string(),
            GameflowPhase::InProgress => "InProgress".to_string(),
            GameflowPhase::WaitingForStats => "WaitingForStats".to_string(),
            GameflowPhase::PreEndOfGame => "PreEndOfGame".to_string(),
            GameflowPhase::EndOfGame => "EndOfGame".to_string(),
            GameflowPhase::TerminatedInError => "TerminatedInError".to_string(),
            GameflowPhase::Unknown(s) => s.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LcuAuth {
    pub process_name: String,
    pub pid: u32,
    pub port: u16,
    pub auth_token: String,
    pub protocol: String,
}

impl LcuAuth {
    pub fn base_url(&self) -> String {
        format!("{}://127.0.0.1:{}", self.protocol, self.port)
    }

    pub fn ws_url(&self) -> String {
        format!("wss://127.0.0.1:{}", self.port)
    }

    pub fn basic_auth_header(&self) -> String {
        let auth_str = format!("riot:{}", self.auth_token);
        use base64::Engine;
        format!("Basic {}", base64::engine::general_purpose::STANDARD.encode(auth_str))
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentSummoner {
    pub account_id: Option<i64>,
    pub summoner_id: Option<i64>,
    pub display_name: Option<String>,
    pub game_name: Option<String>,
    pub tag_line: Option<String>,
    pub profile_icon_id: Option<i32>,
    pub summoner_level: Option<i32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchMetadata {
    pub game_id: Option<i64>,
    pub game_mode: String,
    pub queue_id: i32,
    pub queue_name: String,
    pub champion_id: i32,
    pub champion_name: String,
    pub champion_key: String,
    pub kills: i32,
    pub deaths: i32,
    pub assists: i32,
    pub win: bool,
    pub game_duration_seconds: u32,
    pub start_time: chrono::DateTime<chrono::Local>,
    pub end_time: Option<chrono::DateTime<chrono::Local>>,
    pub highlights: Vec<HighlightMarker>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HighlightMarker {
    pub timestamp_sec: f64,
    pub event_name: String,
    pub event_type: String, // "Kill", "Multikill", "Baron", "Dragon", "Turret", "Ace"
    pub description: String,
    pub killer_name: Option<String>,
    pub victim_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveEventData {
    #[serde(rename = "EventID")]
    pub event_id: Option<i32>,
    #[serde(rename = "EventName")]
    pub event_name: String,
    #[serde(rename = "EventTime")]
    pub event_time: f64,
    #[serde(rename = "KillerName")]
    pub killer_name: Option<String>,
    #[serde(rename = "VictimName")]
    pub victim_name: Option<String>,
    #[serde(rename = "DragonType")]
    pub dragon_type: Option<String>,
    #[serde(rename = "KillStreak")]
    pub kill_streak: Option<i32>,
    #[serde(rename = "Acer")]
    pub acer: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gameflow_phase_parsing() {
        assert_eq!(GameflowPhase::from("\"InProgress\""), GameflowPhase::InProgress);
        assert_eq!(GameflowPhase::from("ChampSelect"), GameflowPhase::ChampSelect);
        assert_eq!(GameflowPhase::from("EndOfGame"), GameflowPhase::EndOfGame);
        assert_eq!(GameflowPhase::from("WaitingForStats"), GameflowPhase::WaitingForStats);
        assert_eq!(GameflowPhase::from("CustomPhase"), GameflowPhase::Unknown("CustomPhase".to_string()));
    }

    #[test]
    fn test_lcu_auth_urls() {
        let auth = LcuAuth {
            process_name: "LeagueClientUx.exe".to_string(),
            pid: 1234,
            port: 50000,
            auth_token: "secret_123".to_string(),
            protocol: "https".to_string(),
        };

        assert_eq!(auth.base_url(), "https://127.0.0.1:50000");
        assert_eq!(auth.ws_url(), "wss://127.0.0.1:50000");
        assert_eq!(auth.basic_auth_header(), "Basic cmlvdDpzZWNyZXRfMTIz");
    }
}
