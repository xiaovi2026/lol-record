use crate::lcu::MatchMetadata;

pub struct NamingFormatter;

impl NamingFormatter {
    /// Formats a filename template using match metadata
    pub fn format(template: &str, metadata: &MatchMetadata) -> String {
        let date_str = metadata.start_time.format("%Y-%m-%d").to_string();
        let time_str = metadata.start_time.format("%H-%M-%S").to_string();
        let datetime_str = metadata.start_time.format("%Y%m%d_%H%M%S").to_string();

        let queue_clean = if metadata.queue_name.is_empty() {
            if metadata.game_mode.is_empty() {
                "Match".to_string()
            } else {
                metadata.game_mode.clone()
            }
        } else {
            metadata.queue_name.replace(" ", "")
        };

        let champion_clean = if metadata.champion_name.is_empty() {
            "Champion".to_string()
        } else {
            metadata.champion_name.replace(" ", "").replace("'", "")
        };

        let kda_str = format!(
            "{}-{}-{}",
            metadata.kills, metadata.deaths, metadata.assists
        );
        let result_str = if metadata.win { "Victory" } else { "Defeat" };
        let duration_str = format!(
            "{}m{}s",
            metadata.game_duration_seconds / 60,
            metadata.game_duration_seconds % 60
        );
        let game_id_str = metadata
            .game_id
            .map(|id| id.to_string())
            .unwrap_or_else(|| "0".to_string());

        let mut output = template.to_string();
        output = output.replace("{date}", &date_str);
        output = output.replace("{time}", &time_str);
        output = output.replace("{datetime}", &datetime_str);
        output = output.replace("{queue}", &queue_clean);
        output = output.replace("{champion}", &champion_clean);
        output = output.replace("{kda}", &kda_str);
        output = output.replace("{kills}", &metadata.kills.to_string());
        output = output.replace("{deaths}", &metadata.deaths.to_string());
        output = output.replace("{assists}", &metadata.assists.to_string());
        output = output.replace("{result}", result_str);
        output = output.replace("{duration}", &duration_str);
        output = output.replace("{gameId}", &game_id_str);

        // Sanitize invalid Windows filename characters: \ / : * ? " < > |
        let invalid_chars = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
        let sanitized: String = output
            .chars()
            .map(|c| if invalid_chars.contains(&c) { '_' } else { c })
            .collect();

        if !sanitized.ends_with(".mp4") {
            format!("{}.mp4", sanitized)
        } else {
            sanitized
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn test_naming_formatter_standard() {
        let fixed_time = chrono::Local
            .with_ymd_and_hms(2026, 8, 25, 14, 30, 0)
            .unwrap();
        let meta = MatchMetadata {
            game_id: Some(123456789),
            game_mode: "CLASSIC".to_string(),
            queue_id: 420,
            queue_name: "Ranked Solo".to_string(),
            champion_id: 266,
            champion_name: "Aatrox".to_string(),
            champion_key: "Aatrox".to_string(),
            kills: 12,
            deaths: 2,
            assists: 5,
            win: true,
            game_duration_seconds: 1845,
            start_time: fixed_time,
            end_time: None,
            highlights: vec![],
        };

        let result = NamingFormatter::format("{date}_{queue}_{champion}_{kda}_{result}.mp4", &meta);
        assert_eq!(result, "2026-08-25_RankedSolo_Aatrox_12-2-5_Victory.mp4");
    }

    #[test]
    fn test_naming_formatter_sanitization() {
        let fixed_time = chrono::Local
            .with_ymd_and_hms(2026, 8, 25, 14, 30, 0)
            .unwrap();
        let meta = MatchMetadata {
            game_id: Some(999),
            game_mode: "CLASSIC".to_string(),
            queue_id: 420,
            queue_name: "Ranked:Special/Mode".to_string(),
            champion_id: 1,
            champion_name: "Kai'Sa".to_string(),
            kills: 5,
            deaths: 0,
            assists: 10,
            win: true,
            game_duration_seconds: 1200,
            start_time: fixed_time,
            end_time: None,
            highlights: vec![],
        };

        let result = NamingFormatter::format("{date}_{queue}_{champion}_{kda}_{result}", &meta);
        assert_eq!(
            result,
            "2026-08-25_Ranked_Special_Mode_KaiSa_5-0-10_Victory.mp4"
        );
    }
}
