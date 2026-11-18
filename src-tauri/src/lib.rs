use futures_util::StreamExt;
use serde::Serialize;
use std::fs::{self, File, OpenOptions};
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

const AUDIO_EXTS: &[&str] = &["mp3", "m4a", "flac", "ogg", "wav", "webm", "bin"];

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

fn find_cached_file(audio_dir: &Path, stem: &str) -> Option<PathBuf> {
    for ext in AUDIO_EXTS {
        let candidate = audio_dir.join(format!("{stem}.{ext}"));
        if candidate.is_file() {
            if let Ok(meta) = fs::metadata(&candidate) {
                if meta.len() > 0 {
                    return Some(candidate);
                }
            }
        }
    }
    None
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

async fn write_response_to_file(
    response: reqwest::Response,
    dest: &Path,
    tmp: &Path,
    append_from: u64,
) -> Result<(), String> {
    let mut file = if append_from > 0 {
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(tmp)
            .map_err(|e| format!("open temp append: {e}"))?
    } else {
        File::create(tmp).map_err(|e| format!("create temp: {e}"))?
    };

    let mut stream = response.bytes_stream();
    let mut written = append_from;
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("download chunk: {e}"))?;
        file.write_all(&bytes)
            .map_err(|e| format!("write temp: {e}"))?;
        written += bytes.len() as u64;
    }

    if written == 0 {
        let _ = fs::remove_file(tmp);
        return Err("download returned empty body".into());
    }

    file.sync_all().map_err(|e| format!("sync temp: {e}"))?;
    drop(file);
    fs::rename(tmp, dest).map_err(|e| format!("finalize file: {e}"))?;
    Ok(())
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

/// Find an existing cached audio file for a quality-specific stem.
#[tauri::command]
fn lookup_cached_audio(app: AppHandle, file_stem: String) -> Result<Option<String>, String> {
    let paths = ensure_dirs(&app)?;
    let stem = sanitize_stem(&file_stem);
    let audio_dir = PathBuf::from(&paths.audio_dir);
    Ok(find_cached_file(&audio_dir, &stem).map(|p| p.to_string_lossy().into_owned()))
}

/// Download a completed audio URL into `{appData}/cache/audio/` using Range when possible.
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

    if let Some(existing) = find_cached_file(&audio_dir, &stem) {
        return Ok(DownloadAudioResult {
            path: existing.to_string_lossy().into_owned(),
            reused: true,
        });
    }

    let client = reqwest::Client::builder()
        .user_agent("mym-player/0.1")
        .build()
        .map_err(|e| format!("http client: {e}"))?;

    // Probe headers first (may also return body for small responses; we only need headers).
    let head = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "*/*")
        .header(reqwest::header::RANGE, "bytes=0-0")
        .send()
        .await
        .map_err(|e| format!("download probe: {e}"))?;

    let status = head.status();
    if !(status.is_success() || status.as_u16() == 206) {
        return Err(format!("download HTTP {status}"));
    }

    let headers = head.headers().clone();
    let content_type = headers
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok());
    let disposition = headers
        .get(reqwest::header::CONTENT_DISPOSITION)
        .and_then(|v| v.to_str().ok());
    let accepts_ranges = headers
        .get(reqwest::header::ACCEPT_RANGES)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_ascii_lowercase().contains("bytes"))
        .unwrap_or(status.as_u16() == 206);

    let ext = ext_from_disposition(disposition)
        .unwrap_or_else(|| ext_from_content_type(content_type, format_hint));
    let dest = audio_dir.join(format!("{stem}.{ext}"));
    let tmp = audio_dir.join(format!("{stem}.{ext}.part"));

    // Drop probe body.
    drop(head);

    let mut append_from = 0_u64;
    if accepts_ranges && tmp.is_file() {
        if let Ok(meta) = fs::metadata(&tmp) {
            append_from = meta.len();
        }
    } else if tmp.is_file() {
        let _ = fs::remove_file(&tmp);
    }

    let mut request = client.get(&url).header(reqwest::header::ACCEPT, "*/*");
    if append_from > 0 {
        request = request.header(
            reqwest::header::RANGE,
            format!("bytes={append_from}-"),
        );
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("download request: {e}"))?;

    let status = response.status();
    if append_from > 0 && status.as_u16() == 200 {
        // Server ignored Range — restart full download.
        append_from = 0;
        let _ = fs::remove_file(&tmp);
        let full = client
            .get(&url)
            .header(reqwest::header::ACCEPT, "*/*")
            .send()
            .await
            .map_err(|e| format!("download restart: {e}"))?;
        if !full.status().is_success() {
            return Err(format!("download HTTP {}", full.status()));
        }
        write_response_to_file(full, &dest, &tmp, 0).await?;
    } else if status.is_success() || status.as_u16() == 206 {
        write_response_to_file(response, &dest, &tmp, append_from).await?;
    } else {
        return Err(format!("download HTTP {status}"));
    }

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
            lookup_cached_audio,
            download_audio
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
