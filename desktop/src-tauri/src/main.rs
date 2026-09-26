#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Deserialize;
use std::{path::PathBuf, process::Command};
#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Deserialize)]
struct Config {
    repository_root: PathBuf,
    node_executable: PathBuf,
}

fn config() -> Result<Config, String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let path = executable.parent().ok_or("Cannot locate Room launcher")?.join("room-launcher.json");
    let bytes = std::fs::read(&path).map_err(|error| format!("无法读取 {}: {error}", path.display()))?;
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

#[tauri::command]
async fn start_room() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let config = config()?;
        let mut command = Command::new(&config.node_executable);
        command.arg(config.repository_root.join("tools/room-desktop/launch.mjs"))
            .arg("--project").arg(&config.repository_root)
            .current_dir(&config.repository_root);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let output = command.output().map_err(|error| format!("启动失败: {error}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        serde_json::from_slice(&output.stdout).map_err(|error| format!("启动结果无效: {error}"))
    }).await.map_err(|error| error.to_string())?
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![start_room])
        .run(tauri::generate_context!())
        .expect("Room desktop could not start");
}
