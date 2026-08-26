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
        if name.contains("leagueclientux") {
            let cmd = process.cmd().join(" ");
            
            let port = port_re.captures(&cmd)?
                .get(1)?
                .as_str()
                .parse::<u16>()
                .ok()?;
            let token = token_re.captures(&cmd)?
                .get(1)?
                .as_str()
                .to_string();
                
            return Some(LcuCredentials { port, token });
        }
    }
    None
}
