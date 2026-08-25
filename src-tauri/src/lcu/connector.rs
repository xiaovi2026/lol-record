use super::models::LcuAuth;
use regex::Regex;
use std::fs;
use std::path::Path;
use sysinfo::{ProcessRefreshKind, RefreshKind, System};
use tracing::{debug, info};

pub struct LcuConnector;

impl LcuConnector {
    /// Attempts to find the LCU credentials by inspecting running League processes.
    pub fn find_auth() -> Option<LcuAuth> {
        // Method 1: Inspect process command line arguments for LeagueClientUx
        if let Some(auth) = Self::find_from_process() {
            return Some(auth);
        }

        // Method 2: Inspect default lockfile paths if known
        if let Some(auth) = Self::find_from_lockfile() {
            return Some(auth);
        }

        None
    }

    fn find_from_process() -> Option<LcuAuth> {
        let mut sys = System::new_with_specifics(
            RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
        );
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

        let target_names = ["LeagueClientUx.exe", "LeagueClientUx", "LeagueClient.exe", "LeagueClient"];

        for (pid, process) in sys.processes() {
            let proc_name = process.name().to_string_lossy();
            if target_names.iter().any(|&target| proc_name.eq_ignore_ascii_case(target)) {
                let cmd = process.cmd();
                let full_cmd = cmd.iter().map(|s| s.to_string_lossy()).collect::<Vec<_>>().join(" ");

                debug!("Found potential LCU process {} (PID: {}): {}", proc_name, pid, full_cmd);

                let port_re = Regex::new(r#"--app-port=(\d+)"#).ok()?;
                let token_re = Regex::new(r#"--remoting-auth-token=([\w-_]+)"#).ok()?;

                let port: u16 = port_re.captures(&full_cmd)?.get(1)?.as_str().parse().ok()?;
                let auth_token = token_re.captures(&full_cmd)?.get(1)?.as_str().to_string();

                info!("Detected LCU client on port {} (PID: {})", port, pid.as_u32());
                return Some(LcuAuth {
                    process_name: proc_name.to_string(),
                    pid: pid.as_u32(),
                    port,
                    auth_token,
                    protocol: "https".to_string(),
                });
            }
        }
        None
    }

    fn find_from_lockfile() -> Option<LcuAuth> {
        // Check common default install paths on Windows
        let candidate_paths = [
            r"C:\Riot Games\League of Legends\lockfile",
            r"D:\Riot Games\League of Legends\lockfile",
            r"E:\Riot Games\League of Legends\lockfile",
            r"F:\Riot Games\League of Legends\lockfile",
            r"C:\Program Files\Riot Games\League of Legends\lockfile",
            r"C:\Program Files (x86)\Riot Games\League of Legends\lockfile",
        ];

        for path_str in candidate_paths {
            let path = Path::new(path_str);
            if path.exists() {
                if let Ok(content) = fs::read_to_string(path) {
                    // Lockfile format: process_name:pid:port:password:protocol
                    let parts: Vec<&str> = content.trim().split(':').collect();
                    if parts.len() >= 5 {
                        if let (Ok(pid), Ok(port)) = (parts[1].parse::<u32>(), parts[2].parse::<u16>()) {
                            info!("Detected LCU client from lockfile {:?} on port {}", path, port);
                            return Some(LcuAuth {
                                process_name: parts[0].to_string(),
                                pid,
                                port,
                                auth_token: parts[3].to_string(),
                                protocol: parts[4].to_string(),
                            });
                        }
                    }
                }
            }
        }
        None
    }
}
