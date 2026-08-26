use sysinfo::System;
use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LcuCredentials {
    pub port: u16,
    pub token: String,
}

pub fn get_lcu_credentials() -> Option<LcuCredentials> {
    let mut system = System::new_all();
    system.refresh_processes();
    
    let port_re = Regex::new(r"--app-port=(\d+)").unwrap();
    let token_re = Regex::new(r"--remoting-auth-token=([a-zA-Z0-9_-]+)").unwrap();
    
    for (_, process) in system.processes() {
        let name = process.name().to_lowercase();
        // LeagueClientUx is the main process with the auth token and port
        if name == "leagueclientux.exe" || name == "leagueclientux" || name.contains("leagueclientux") {
            let cmd = process.cmd().join(" ");
            
            if let (Some(port_cap), Some(token_cap)) = (port_re.captures(&cmd), token_re.captures(&cmd)) {
                if let (Some(port_match), Some(token_match)) = (port_cap.get(1), token_cap.get(1)) {
                    if let Ok(port) = port_match.as_str().parse::<u16>() {
                        let token = token_match.as_str().to_string();
                        return Some(LcuCredentials { port, token });
                    }
                }
            }
        }
    }
    None
}
