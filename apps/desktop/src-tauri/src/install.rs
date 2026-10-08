use crate::settings::AppSettings;
use std::path::Path;
use std::process::Command;
#[cfg(all(unix, not(target_os = "macos")))]
use std::process::Stdio;

const STRATA_REPO: &str = "https://github.com/Niko1221/Strata.git";

pub fn install_strata(settings: &AppSettings) -> Result<String, String> {
    let strata_dir = Path::new(settings.strata_dir.trim());
    let setup = if cfg!(target_os = "windows") {
        strata_dir.join("START-HERE.bat")
    } else {
        strata_dir.join("setup.sh")
    };

    if !setup.is_file() {
        if strata_dir.exists() && !strata_dir.join(".git").exists() {
            return Err(format!(
                "{} exists but is not a Strata clone — remove or change install path",
                strata_dir.display()
            ));
        }
        clone_repo(strata_dir)?;
    }

    if !setup.is_file() {
        return Err(format!("Setup script missing after clone: {}", setup.display()));
    }

    launch_setup(&setup)?;
    Ok(format!(
        "Started {} — follow the terminal wizard; then open Strata UI at http://127.0.0.1:8080",
        setup.display()
    ))
}

fn clone_repo(dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let status = Command::new("git")
        .args(["clone", "--depth", "1", STRATA_REPO])
        .arg(dest)
        .status()
        .map_err(|e| format!("git clone failed: {e}"))?;
    if !status.success() {
        return Err("git clone exited with error".into());
    }
    Ok(())
}

fn launch_setup(script: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", script.to_str().unwrap()])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let script = script.to_string_lossy();
        let cmd = format!(
            "cd \"$(dirname \"{script}\")\" && chmod +x \"{script}\" && \"{script}\""
        );
        Command::new("osascript")
            .args([
                "-e",
                &format!(
                    "tell application \"Terminal\" to do script \"{cmd}\""
                ),
            ])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let dir = script.parent().ok_or("invalid script path")?;
        Command::new("x-terminal-emulator")
            .args(["-e", "bash", "-lc"])
            .arg(format!(
                "cd '{}' && chmod +x '{}' && './{}'",
                dir.display(),
                script.file_name().unwrap().to_string_lossy(),
                script.file_name().unwrap().to_string_lossy()
            ))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .or_else(|_| {
                Command::new("bash")
                    .arg(script)
                    .spawn()
                    .map_err(|e| e.to_string())
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

pub fn open_strata_ui() -> Result<(), String> {
    open::that("http://127.0.0.1:8080").map_err(|e| e.to_string())
}
