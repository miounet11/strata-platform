mod deploy;
mod env;
mod install;
mod models;
mod settings;

use env::EnvReport;
use settings::AppSettings;

#[tauri::command]
fn get_settings() -> Result<AppSettings, String> {
    settings::load_settings()
}

#[tauri::command]
fn save_settings(settings: AppSettings) -> Result<(), String> {
    settings::save_settings(&settings)
}

#[tauri::command]
fn scan_environment() -> Result<EnvReport, String> {
    let settings = settings::load_settings()?;
    Ok(env::scan_environment(&settings))
}

#[tauri::command]
fn install_strata_one_click() -> Result<String, String> {
    let settings = settings::load_settings()?;
    install::install_strata(&settings)
}

#[tauri::command]
fn run_strata_setup() -> Result<String, String> {
    install_strata_one_click()
}

#[tauri::command]
fn deploy_stratat_one_click() -> Result<String, String> {
    let settings = settings::load_settings()?;
    deploy::deploy_stratat(&settings)
}

#[tauri::command]
fn apply_site_settings() -> Result<String, String> {
    let settings = settings::load_settings()?;
    settings::save_settings(&settings)?;
    deploy::apply_local_site_settings(&settings)
}

#[tauri::command]
fn open_strata_ui() -> Result<(), String> {
    install::open_strata_ui()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            scan_environment,
            install_strata_one_click,
            run_strata_setup,
            deploy_stratat_one_click,
            apply_site_settings,
            open_strata_ui,
            models::start_model_download,
            models::models_dir_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
