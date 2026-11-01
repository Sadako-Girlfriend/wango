//! 从命令行 / 二次启动接收 .wango 路径，交给前端打开（单实例不重复起进程）。

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

/// 冷启动时暂存的待打开路径（等前端 hydrate 后 take）
pub struct PendingOpenPaths(pub Mutex<Vec<String>>);

pub fn extract_wango_paths(args: &[String]) -> Vec<String> {
  args
    .iter()
    .skip(1)
    .filter_map(|raw| {
      let trimmed = raw.trim().trim_matches('"');
      if trimmed.is_empty() {
        return None;
      }
      let lower = trimmed.to_ascii_lowercase();
      if lower.ends_with(".wango") {
        Some(trimmed.to_string())
      } else {
        None
      }
    })
    .collect()
}

pub fn focus_main_window(app: &AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
  }
}

/// 二次启动：聚焦已有窗口，并把路径发给前端
pub fn forward_open_args(app: &AppHandle, args: &[String]) {
  focus_main_window(app);
  let paths = extract_wango_paths(args);
  if paths.is_empty() {
    return;
  }
  let _ = app.emit("open-wango-files", paths);
}

#[tauri::command]
pub fn take_pending_open_paths(state: State<'_, PendingOpenPaths>) -> Vec<String> {
  state
    .0
    .lock()
    .map(|mut g| std::mem::take(&mut *g))
    .unwrap_or_default()
}
