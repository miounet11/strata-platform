use crate::settings::{home_dir, AppSettings};
use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvCheckItem {
    pub id: String,
    pub label: String,
    pub status: CheckStatus,
    pub detail: String,
    pub fix_hint: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CheckStatus {
    Pass,
    Warn,
    Fail,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvReport {
    pub os: String,
    pub arch: String,
    pub items: Vec<EnvCheckItem>,
    pub ready_for_install: bool,
    pub ready_for_deploy: bool,
}

pub fn scan_environment(settings: &AppSettings) -> EnvReport {
    let mut items = Vec::new();

    items.push(check_tool(
        "git",
        "Git",
        "git",
        &["--version"],
        None,
        Some("Install Git: https://git-scm.com/downloads"),
    ));
    items.push(check_tool(
        "bash",
        "Bash / shell",
        if cfg!(target_os = "windows") {
            "cmd"
        } else {
            "bash"
        },
        if cfg!(target_os = "windows") {
            &["/C", "echo ok"]
        } else {
            &["--version"]
        },
        None,
        None,
    ));

    items.push(check_disk(&settings.strata_dir));
    items.push(check_memory());
    items.push(check_network());
    items.push(check_strata_tree(&settings.strata_dir));
    items.push(check_gpu_hint());

    items.push(check_tool(
        "node",
        "Node.js (deploy / dev)",
        "node",
        &["--version"],
        Some("Optional for VPS deploy from source"),
        Some("Install Node 22+: https://nodejs.org/"),
    ));
    items.push(check_tool(
        "ssh",
        "SSH client",
        "ssh",
        &["-V"],
        Some("Required for one-click deploy"),
        Some("macOS/Linux: built-in; Windows: OpenSSH Client optional feature"),
    ));
    items.push(check_tool(
        "rsync",
        "rsync",
        "rsync",
        &["--version"],
        Some("Required for one-click deploy"),
        Some("macOS: built-in; Windows: Git for Windows or WSL"),
    ));

    let repo = settings.stratat_repo_dir.trim();
    if !repo.is_empty() {
        items.push(check_stratat_repo(repo));
    } else {
        items.push(EnvCheckItem {
            id: "stratat_repo".into(),
            label: "Stratat monorepo path".into(),
            status: CheckStatus::Warn,
            detail: "Not set — add path in Settings for deploy".into(),
            fix_hint: Some("Clone stratat repo and set folder in Settings".into()),
        });
    }

    fn status_of(items: &[EnvCheckItem], id: &str) -> Option<CheckStatus> {
        items
            .iter()
            .find(|i| i.id == id)
            .map(|i| i.status.clone())
    }

    let ready_for_install = matches!(status_of(&items, "git"), Some(CheckStatus::Pass))
        && !matches!(status_of(&items, "bash"), Some(CheckStatus::Fail))
        && !matches!(status_of(&items, "disk"), Some(CheckStatus::Fail));

    let ready_for_deploy = matches!(status_of(&items, "git"), Some(CheckStatus::Pass))
        && matches!(status_of(&items, "ssh"), Some(CheckStatus::Pass))
        && matches!(status_of(&items, "rsync"), Some(CheckStatus::Pass))
        && matches!(status_of(&items, "stratat_repo"), Some(CheckStatus::Pass));

    EnvReport {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        items,
        ready_for_install,
        ready_for_deploy,
    }
}

fn check_tool(
    id: &str,
    label: &str,
    bin: &str,
    args: &[&str],
    optional_note: Option<&str>,
    fix_hint: Option<&str>,
) -> EnvCheckItem {
    match Command::new(bin).args(args).output() {
        Ok(out) if out.status.success() || id == "ssh" => {
            let detail = String::from_utf8_lossy(&out.stdout)
                .trim()
                .lines()
                .next()
                .unwrap_or("")
                .to_string();
            let detail = if detail.is_empty() {
                String::from_utf8_lossy(&out.stderr).trim().to_string()
            } else {
                detail
            };
            EnvCheckItem {
                id: id.into(),
                label: label.into(),
                status: CheckStatus::Pass,
                detail: optional_note
                    .map(|n| format!("{detail} — {n}"))
                    .unwrap_or(detail),
                fix_hint: None,
            }
        }
        Ok(_) => EnvCheckItem {
            id: id.into(),
            label: label.into(),
            status: if optional_note.is_some() {
                CheckStatus::Warn
            } else {
                CheckStatus::Fail
            },
            detail: "Command failed".into(),
            fix_hint: fix_hint.map(String::from),
        },
        Err(_) => EnvCheckItem {
            id: id.into(),
            label: label.into(),
            status: if optional_note.is_some() {
                CheckStatus::Warn
            } else {
                CheckStatus::Fail
            },
            detail: "Not found on PATH".into(),
            fix_hint: fix_hint.map(String::from),
        },
    }
}

fn check_disk(strata_dir: &str) -> EnvCheckItem {
    let parent = Path::new(strata_dir)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(home_dir);

    let disks = sysinfo::Disks::new_with_refreshed_list();
    let parent_str = parent.to_string_lossy();
    for disk in disks.list() {
        let mount = disk.mount_point().to_string_lossy();
        if parent_str.starts_with(mount.as_ref()) || mount.as_ref() == "/" {
            let gb = disk.available_space() as f64 / 1024.0_f64.powi(3);
            let status = if gb >= 80.0 {
                CheckStatus::Pass
            } else if gb >= 40.0 {
                CheckStatus::Warn
            } else {
                CheckStatus::Fail
            };
            return EnvCheckItem {
                id: "disk".into(),
                label: "Free disk (install volume)".into(),
                status,
                detail: format!("{gb:.1} GB free on {mount} (install: {strata_dir})"),
                fix_hint: if gb < 40.0 {
                    Some("Strata + models need tens of GB; free space or change install path".into())
                } else {
                    None
                },
            };
        }
    }

    EnvCheckItem {
        id: "disk".into(),
        label: "Free disk".into(),
        status: CheckStatus::Warn,
        detail: format!("Could not measure volume; target install: {strata_dir}"),
        fix_hint: None,
    }
}

fn check_memory() -> EnvCheckItem {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    let total_gb = sys.total_memory() as f64 / 1024.0_f64.powi(3);
    let status = if total_gb >= 32.0 {
        CheckStatus::Pass
    } else if total_gb >= 16.0 {
        CheckStatus::Warn
    } else {
        CheckStatus::Fail
    };
    EnvCheckItem {
        id: "ram".into(),
        label: "System RAM".into(),
        status,
        detail: format!("{total_gb:.1} GB total"),
        fix_hint: if total_gb < 16.0 {
            Some("Large MoE models need 32 GB+ system RAM for comfortable use".into())
        } else {
            None
        },
    }
}

fn check_network() -> EnvCheckItem {
    let ok = Command::new("git")
        .args(["ls-remote", "--heads", "https://github.com/Niko1221/Strata.git", "HEAD"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    EnvCheckItem {
        id: "network".into(),
        label: "GitHub reachability".into(),
        status: if ok {
            CheckStatus::Pass
        } else {
            CheckStatus::Warn
        },
        detail: if ok {
            "Can reach Niko1221/Strata".into()
        } else {
            "Could not verify GitHub (proxy / offline?)".into()
        },
        fix_hint: if ok {
            None
        } else {
            Some("Check VPN/proxy; clone may still work in browser".into())
        },
    }
}

fn check_strata_tree(strata_dir: &str) -> EnvCheckItem {
    let root = Path::new(strata_dir);
    let setup = if cfg!(target_os = "windows") {
        root.join("START-HERE.bat")
    } else {
        root.join("setup.sh")
    };
    if setup.is_file() {
        EnvCheckItem {
            id: "strata_tree".into(),
            label: "Strata engine checkout".into(),
            status: CheckStatus::Pass,
            detail: format!("Found {}", setup.display()),
            fix_hint: None,
        }
    } else {
        EnvCheckItem {
            id: "strata_tree".into(),
            label: "Strata engine checkout".into(),
            status: CheckStatus::Warn,
            detail: format!("Not found at {strata_dir} — one-click install will clone"),
            fix_hint: Some("Use 一键安装 or git clone https://github.com/Niko1221/Strata".into()),
        }
    }
}

fn check_stratat_repo(path: &str) -> EnvCheckItem {
    let deploy = Path::new(path).join("deploy/sync-and-deploy.sh");
    if deploy.is_file() {
        EnvCheckItem {
            id: "stratat_repo".into(),
            label: "Stratat monorepo".into(),
            status: CheckStatus::Pass,
            detail: format!("deploy script at {}", deploy.display()),
            fix_hint: None,
        }
    } else {
        EnvCheckItem {
            id: "stratat_repo".into(),
            label: "Stratat monorepo".into(),
            status: CheckStatus::Fail,
            detail: format!("Missing deploy/sync-and-deploy.sh under {path}"),
            fix_hint: Some("Point Settings to the stratat repo root (contains apps/www)".into()),
        }
    }
}

fn check_gpu_hint() -> EnvCheckItem {
    if cfg!(target_os = "windows") {
        if let Ok(out) = Command::new("nvidia-smi").arg("--query-gpu=name").arg("--format=csv,noheader").output() {
            if out.status.success() {
                let names = String::from_utf8_lossy(&out.stdout).trim().to_string();
                return EnvCheckItem {
                    id: "gpu".into(),
                    label: "GPU (NVIDIA)".into(),
                    status: CheckStatus::Pass,
                    detail: names,
                    fix_hint: None,
                };
            }
        }
        return EnvCheckItem {
            id: "gpu".into(),
            label: "GPU".into(),
            status: CheckStatus::Warn,
            detail: "nvidia-smi not found — CUDA build may need NVIDIA driver".into(),
            fix_hint: Some("Install Game Ready / Studio driver, or use CPU/AMD path per Strata docs".into()),
        };
    }

    if Command::new("nvidia-smi").output().map(|o| o.status.success()).unwrap_or(false) {
        return EnvCheckItem {
            id: "gpu".into(),
            label: "GPU (NVIDIA)".into(),
            status: CheckStatus::Pass,
            detail: "nvidia-smi OK".into(),
            fix_hint: None,
        };
    }
    if Command::new("rocm-smi").output().map(|o| o.status.success()).unwrap_or(false) {
        return EnvCheckItem {
            id: "gpu".into(),
            label: "GPU (AMD ROCm)".into(),
            status: CheckStatus::Pass,
            detail: "rocm-smi OK".into(),
            fix_hint: None,
        };
    }

    EnvCheckItem {
        id: "gpu".into(),
        label: "GPU".into(),
        status: CheckStatus::Warn,
        detail: "No nvidia-smi / rocm-smi — verify GPU stack during setup.sh".into(),
        fix_hint: None,
    }
}
