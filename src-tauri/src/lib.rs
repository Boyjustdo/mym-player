use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CachePaths {
    app_data_dir: String,
    cache_root: String,
    audio_dir: String,
    covers_dir: String,
    lyrics_dir: String,
}

fn app_data_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("resolve app data dir: {e}"))
}

fn build_cache_paths(app_data: PathBuf) -> CachePaths {
    let cache_root = app_data.join("cache");
    CachePaths {
        app_data_dir: app_data.to_string_lossy().into_owned(),
        audio_dir: cache_root.join("audio").to_string_lossy().into_owned(),
        covers_dir: cache_root.join("covers").to_string_lossy().into_owned(),
        lyrics_dir: cache_root.join("lyrics").to_string_lossy().into_owned(),
        cache_root: cache_root.to_string_lossy().into_owned(),
    }
}

/// Return the application data directory path.
#[tauri::command]
fn get_app_data_dir(app: AppHandle) -> Result<String, String> {
    Ok(app_data_path(&app)?.to_string_lossy().into_owned())
}

/// Ensure local cache directories exist and return their paths.
/// Layout: `{appData}/cache/{audio,covers,lyrics}`
#[tauri::command]
fn ensure_cache_dirs(app: AppHandle) -> Result<CachePaths, String> {
    let app_data = app_data_path(&app)?;
    let paths = build_cache_paths(app_data);

    for dir in [
        &paths.cache_root,
        &paths.audio_dir,
        &paths.covers_dir,
        &paths.lyrics_dir,
    ] {
        fs::create_dir_all(dir).map_err(|e| format!("create {dir}: {e}"))?;
    }

    Ok(paths)
}

/// Open the cache root directory in the system file manager.
#[tauri::command]
fn open_cache_dir(app: AppHandle) -> Result<(), String> {
    let paths = ensure_cache_dirs(app.clone())?;
    app.opener()
        .open_path(paths.cache_root, None::<&str>)
        .map_err(|e| format!("open cache dir: {e}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_app_data_dir,
            ensure_cache_dirs,
            open_cache_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
