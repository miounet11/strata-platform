use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub strata_dir: String,
    pub stratat_repo_dir: String,
    pub deploy_host: String,
    pub deploy_user: String,
    pub ssh_identity_file: String,
    pub site_url: String,
    pub api_url: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        let home = home_dir().display().to_string();
        Self {
            strata_dir: format!("{home}/Strata"),
            stratat_repo_dir: String::new(),
            deploy_host: String::new(),
            deploy_user: "root".into(),
            ssh_identity_file: String::new(),
            site_url: "https://www.stratat.com".into(),
            api_url: "https://api.strata.com".into(),
        }
    }
}

fn config_path() -> Result<PathBuf, String> {
    let base = dirs_config_base().ok_or("Cannot resolve config directory")?;
    Ok(base.join("strata-desktop").join("settings.json"))
}

fn dirs_config_base() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support"))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA").map(PathBuf::from)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::env::var_os("XDG_CONFIG_HOME")
            .or_else(|| std::env::var_os("HOME").map(|h| format!("{h}/.config").into()))
            .map(PathBuf::from)
    }
}

pub fn load_settings() -> Result<AppSettings, String> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

pub fn home_dir() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}
