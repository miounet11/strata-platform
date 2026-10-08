use crate::settings::AppSettings;
use std::path::Path;
use std::process::Command;

pub fn deploy_stratat(settings: &AppSettings) -> Result<String, String> {
    let repo = settings.stratat_repo_dir.trim();
    if repo.is_empty() {
        return Err("Set stratat monorepo path in Settings first".into());
    }
    let script = Path::new(repo).join("deploy/sync-and-deploy.sh");
    if !script.is_file() {
        return Err(format!("Missing {}", script.display()));
    }
    let host = settings.deploy_host.trim();
    if host.is_empty() {
        return Err("Set deploy host (VPS IP or hostname) in Settings".into());
    }

    #[cfg(unix)]
    {
        let _ = &script;
        launch_in_terminal(&format!(
            "cd '{}' && DEPLOY_HOST='{}' DEPLOY_USER='{}'{} bash deploy/sync-and-deploy.sh",
            repo,
            host,
            settings.deploy_user.trim(),
            if settings.ssh_identity_file.trim().is_empty() {
                String::new()
            } else {
                format!(" SSH_KEY='{}'", settings.ssh_identity_file.trim())
            }
        ))?;
        return Ok(
            "Started deploy in Terminal — rsync + remote-bootstrap (build on VPS). Watch SSH output."
                .into(),
        );
    }

    #[cfg(windows)]
    {
        let mut cmd = format!(
            "cd /d \"{repo}\" && set DEPLOY_HOST={host} && set DEPLOY_USER={user}",
            repo = repo,
            host = host,
            user = settings.deploy_user.trim()
        );
        if !settings.ssh_identity_file.trim().is_empty() {
            cmd.push_str(&format!(
                " && set SSH_KEY={}",
                settings.ssh_identity_file.trim()
            ));
        }
        cmd.push_str(" && bash deploy/sync-and-deploy.sh");
        Command::new("cmd")
            .args(["/C", "start", "cmd", "/k", &cmd])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok("Started deploy window — requires Git Bash bash/rsync/ssh on PATH.".into())
    }
}

#[cfg(unix)]
fn launch_in_terminal(shell_cmd: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let escaped = shell_cmd.replace('\\', "\\\\").replace('"', "\\\"");
        Command::new("osascript")
            .args([
                "-e",
                &format!("tell application \"Terminal\" to do script \"{escaped}\""),
            ])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        Command::new("x-terminal-emulator")
            .args(["-e", "bash", "-lc", shell_cmd])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

pub fn apply_local_site_settings(settings: &AppSettings) -> Result<String, String> {
    let repo = settings.stratat_repo_dir.trim();
    if repo.is_empty() {
        return Ok("Saved URLs in app settings only (no repo path)".into());
    }
    let env_path = Path::new(repo).join("apps/api/.env.example");
    let hint = if env_path.is_file() {
        format!(
            "For local dev, copy {} to apps/api/.env and set CORS_ORIGIN={}",
            env_path.display(),
            settings.site_url.trim()
        )
    } else {
        "Set NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_API_URL when running www locally".into()
    };
    Ok(format!(
        "Site {} · API {}. {}",
        settings.site_url.trim(),
        settings.api_url.trim(),
        hint
    ))
}
