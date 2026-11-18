use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadAudioResult {
    path: String,
    reused: bool,
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

fn ensure_dirs(app: &AppHandle) -> Result<CachePaths, String> {
    let app_data = app_data_path(app)?;
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

fn sanitize_stem(stem: &str) -> String {
    let cleaned: String = stem
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('_');
    if trimmed.is_empty() {
        "track".to_string()
    } else {
        trimmed.to_string()
    }
}

fn ext_from_content_type(content_type: Option<&str>, format_hint: Option<&str>) -> String {
    if let Some(ct) = content_type {
        let mime = ct.split(';').next().unwrap_or(ct).trim().to_ascii_lowercase();
        let mapped = match mime.as_str() {
            "audio/mpeg" | "audio/mp3" => Some("mp3"),
            "audio/mp4" | "audio/aac" | "audio/x-m4a" | "audio/m4a" => Some("m4a"),
            "audio/flac" | "audio/x-flac" => Some("flac"),
            "audio/ogg" | "application/ogg" | "audio/opus" => Some("ogg"),
            "audio/wav" | "audio/x-wav" | "audio/wave" => Some("wav"),
            "audio/webm" => Some("webm"),
            _ => None,
        };
        if let Some(ext) = mapped {
            return ext.to_string();
        }
    }

    if let Some(hint) = format_hint {
        let h = hint.trim().trim_start_matches('.').to_ascii_lowercase();
        if matches!(
            h.as_str(),
            "mp3" | "m4a" | "aac" | "flac" | "ogg" | "opus" | "wav" | "webm"
        ) {
            return if h == "aac" {
                "m4a".to_string()
            } else {
                h
            };
        }
    }

    "bin".to_string()
}

fn ext_from_disposition(header: Option<&str>) -> Option<String> {
    let value = header?;
    // filename="foo.mp3" or filename*=UTF-8''foo.mp3
    let lower = value.to_ascii_lowercase();
    let name = if let Some(idx) = lower.find("filename*=") {
        let rest = &value[idx + "filename*=".len()..];
        rest.split(';')
            .next()
            .unwrap_or(rest)
            .trim()
            .trim_matches('"')
            .rsplit("''")
            .next()
            .unwrap_or("")
            .to_string()
    } else if let Some(idx) = lower.find("filename=") {
        let rest = &value[idx + "filename=".len()..];
        rest.split(';')
            .next()
            .unwrap_or(rest)
            .trim()
            .trim_matches('"')
            .to_string()
    } else {
        return None;
    };

    Path::new(&name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
}

/// Return the application data directory path.
#[tauri::command]
fn get_app_data_dir(app: AppHandle) -> Result<String, String> {
    Ok(app_data_path(&app)?.to_string_lossy().into_owned())
}

/// Ensure local cache directories exist and return their paths.
#[tauri::command]
fn ensure_cache_dirs(app: AppHandle) -> Result<CachePaths, String> {
    ensure_dirs(&app)
}

/// Open the cache root directory in the system file manager.
#[tauri::command]
fn open_cache_dir(app: AppHandle) -> Result<(), String> {
    let paths = ensure_dirs(&app)?;
    app.opener()
        .open_path(paths.cache_root, None::<&str>)
        .map_err(|e| format!("open cache dir: {e}"))?;
    Ok(())
}

/// Download a completed audio URL into `{appData}/cache/audio/`.
/// Does not forge browser headers or forward cookies.
#[tauri::command]
async fn download_audio(
    app: AppHandle,
    url: String,
    file_stem: String,
    format_hint: Option<String>,
) -> Result<DownloadAudioResult, String> {
    let paths = ensure_dirs(&app)?;
    let stem = sanitize_stem(&file_stem);
    let format_hint = format_hint.as_deref();
    let audio_dir = PathBuf::from(&paths.audio_dir);

    for ext in ["mp3", "m4a", "flac", "ogg", "wav", "webm", "bin"] {
        let candidate = audio_dir.join(format!("{stem}.{ext}"));
        if candidate.is_file() {
            if let Ok(meta) = fs::metadata(&candidate) {
                if meta.len() > 0 {
                    return Ok(DownloadAudioResult {
                        path: candidate.to_string_lossy().into_owned(),
                        reused: true,
                    });
                }
            }
        }
    }

    let client = reqwest::Client::builder()
        .user_agent("mym-player/0.1")
        .build()
        .map_err(|e| format!("http client: {e}"))?;

    let response = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "*/*")
        .send()
        .await
        .map_err(|e| format!("download request: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("download HTTP {}", response.status()));
    }

    let headers = response.headers().clone();
    let content_type = headers
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok());
    let disposition = headers
        .get(reqwest::header::CONTENT_DISPOSITION)
        .and_then(|v| v.to_str().ok());

    let ext = ext_from_disposition(disposition)
        .unwrap_or_else(|| ext_from_content_type(content_type, format_hint));

    let dest = audio_dir.join(format!("{stem}.{ext}"));

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("download body: {e}"))?;

    if bytes.is_empty() {
        return Err("download returned empty body".into());
    }

    let tmp = dest.with_extension(format!("{ext}.part"));
    {
        let mut file = fs::File::create(&tmp).map_err(|e| format!("create temp: {e}"))?;
        file.write_all(&bytes)
            .map_err(|e| format!("write temp: {e}"))?;
        file.sync_all().map_err(|e| format!("sync temp: {e}"))?;
    }
    fs::rename(&tmp, &dest).map_err(|e| format!("finalize file: {e}"))?;

    Ok(DownloadAudioResult {
        path: dest.to_string_lossy().into_owned(),
        reused: false,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_app_data_dir,
            ensure_cache_dirs,
            open_cache_dir,
            download_audio
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
