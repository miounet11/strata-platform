use std::path::PathBuf;
use std::process::Command;

use crate::settings::load_settings;

#[tauri::command]
pub fn start_model_download(hf_url: String, filename: Option<String>) -> Result<String, String> {
    let settings = load_settings()?;
    let dir = PathBuf::from(settings.strata_dir.trim()).join("models");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let name = filename.unwrap_or_else(|| "model.gguf".into());
    let dest = dir.join(&name);

    #[cfg(unix)]
    {
        let url = hf_url.replace('\'', "'\\''");
        let out = dest.display().to_string().replace('\'', "'\\''");
        let cmd = format!("curl -L --continue-at - '{url}' -o '{out}'");
        Command::new("bash")
            .args(["-lc", &cmd])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(format!(
            "Started curl download to {} (resume supported). Target Strata models folder.",
            dest.display()
        ));
    }

    #[cfg(windows)]
    {
        let cmd = format!(
            "curl.exe -L -C - \"{hf_url}\" -o \"{}\"",
            dest.display()
        );
        Command::new("cmd")
            .args(["/C", "start", "cmd", "/k", &cmd])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(format!("Started download window → {}", dest.display()))
    }
}

#[tauri::command]
pub fn models_dir_path() -> Result<String, String> {
    let settings = load_settings()?;
    let p = PathBuf::from(settings.strata_dir.trim()).join("models");
    Ok(p.display().to_string())
}
