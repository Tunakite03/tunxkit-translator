use chrono::Local;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Get the default transcript directory path (app data)
fn default_transcript_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("transcripts");

    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create transcript dir: {}", e))?;
    Ok(dir)
}

/// Resolve the transcript directory: use custom path if provided, otherwise default
fn resolve_transcript_dir(app: &AppHandle, custom_path: &str) -> Result<PathBuf, String> {
    if custom_path.is_empty() {
        default_transcript_dir(app)
    } else {
        let dir = PathBuf::from(custom_path);
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create transcript dir: {}", e))?;
        Ok(dir)
    }
}

/// Save a complete transcript session to a timestamped file
/// Called when user clicks "Clear", stops recording, or closes app
#[tauri::command]
pub fn save_transcript(
    app: AppHandle,
    content: String,
    custom_path: Option<String>,
) -> Result<String, String> {
    let dir = resolve_transcript_dir(&app, &custom_path.unwrap_or_default())?;
    let now = Local::now();
    let filename = format!("{}.md", now.format("%Y-%m-%d_%H-%M-%S"));
    let filepath = dir.join(&filename);

    fs::write(&filepath, content).map_err(|e| format!("Failed to save transcript: {}", e))?;

    Ok(filepath.to_string_lossy().to_string())
}

/// Save transcript to a user-chosen path (Save As)
#[tauri::command]
pub fn save_transcript_as(path: String, content: String) -> Result<String, String> {
    let filepath = PathBuf::from(&path);

    // Ensure parent directory exists
    if let Some(parent) = filepath.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    fs::write(&filepath, &content).map_err(|e| format!("Failed to save transcript: {}", e))?;

    Ok(filepath.to_string_lossy().to_string())
}

/// Open the transcript directory in the system file manager
#[tauri::command]
pub fn open_transcript_dir(app: AppHandle, custom_path: Option<String>) -> Result<(), String> {
    let dir = resolve_transcript_dir(&app, &custom_path.unwrap_or_default())?;

    #[cfg(target_os = "macos")]
    let cmd = "open";
    #[cfg(target_os = "windows")]
    let cmd = "explorer";
    #[cfg(target_os = "linux")]
    let cmd = "xdg-open";

    std::process::Command::new(cmd)
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("Failed to open transcript dir: {}", e))?;
    Ok(())
}
