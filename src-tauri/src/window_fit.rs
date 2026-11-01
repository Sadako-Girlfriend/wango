//! 按显示器工作区适配首启窗口大小；记住用户调整后的尺寸/位置。
//! 笔记本 / 1080p 台式 / 2K+ 用不同占比，避免固定 1280×800 到处不合身。

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{
  AppHandle, LogicalPosition, LogicalSize, Manager, PhysicalPosition, PhysicalSize, RunEvent,
  WebviewWindow, WindowEvent,
};

/// 窗口状态文件名（落在 app_data_dir）
const STATE_FILE: &str = "window-state.json";

const MIN_W: f64 = 800.0;
const MIN_H: f64 = 560.0;
const MAX_W: f64 = 1920.0;
const MAX_H: f64 = 1200.0;
/// 相对工作区边缘留白，避免贴死任务栏/屏幕边
const MARGIN: f64 = 24.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowState {
  /// 逻辑像素宽（非最大化时的正常尺寸）
  width: f64,
  height: f64,
  /// 逻辑像素位置；缺省则居中
  #[serde(default)]
  x: Option<f64>,
  #[serde(default)]
  y: Option<f64>,
  #[serde(default)]
  maximized: bool,
}

/// 根据工作区逻辑尺寸计算首启窗口大小。
///
/// - 屏宽 < 1600：笔记本倾向，约 80%×85%
/// - 1600–2200：常见 1080p 台式，约 75%×80%
/// - ≥2200：2K+，约 70%×75%，并受 MAX 上限约束
pub fn fit_window_size(work_w: f64, work_h: f64) -> (f64, f64) {
  let work_w = work_w.max(1.0);
  let work_h = work_h.max(1.0);

  let (rw, rh) = if work_w < 1600.0 {
    (0.80, 0.85)
  } else if work_w < 2200.0 {
    (0.75, 0.80)
  } else {
    (0.70, 0.75)
  };

  let max_fit_w = (work_w - MARGIN).max(1.0);
  let max_fit_h = (work_h - MARGIN).max(1.0);

  let w = (work_w * rw)
    .clamp(MIN_W.min(max_fit_w), MAX_W)
    .min(max_fit_w);
  let h = (work_h * rh)
    .clamp(MIN_H.min(max_fit_h), MAX_H)
    .min(max_fit_h);

  (w.round(), h.round())
}

fn state_path(app: &AppHandle) -> Option<PathBuf> {
  app.path().app_data_dir().ok().map(|d| d.join(STATE_FILE))
}

fn load_state(app: &AppHandle) -> Option<WindowState> {
  let path = state_path(app)?;
  let text = fs::read_to_string(path).ok()?;
  serde_json::from_str(&text).ok()
}

fn save_state(app: &AppHandle, state: &WindowState) {
  let Some(path) = state_path(app) else {
    return;
  };
  if let Some(parent) = path.parent() {
    let _ = fs::create_dir_all(parent);
  }
  if let Ok(text) = serde_json::to_string_pretty(state) {
    let _ = fs::write(path, text);
  }
}

/// 返回工作区逻辑坐标：`(x, y, w, h)`
fn logical_work_area(window: &WebviewWindow) -> Option<(f64, f64, f64, f64)> {
  let monitor = window
    .current_monitor()
    .ok()
    .flatten()
    .or_else(|| window.primary_monitor().ok().flatten())?;
  let scale = monitor.scale_factor().max(0.1);
  let area = monitor.work_area();
  let w = area.size.width as f64 / scale;
  let h = area.size.height as f64 / scale;
  let x = area.position.x as f64 / scale;
  let y = area.position.y as f64 / scale;
  Some((x, y, w, h))
}

/// 窗口中心是否落在工作区内（换显示器后避免飞出屏幕）
fn position_on_work_area(
  x: f64,
  y: f64,
  work: (f64, f64, f64, f64),
  win_w: f64,
  win_h: f64,
) -> bool {
  let (wx, wy, ww, wh) = work;
  let cx = x + win_w * 0.5;
  let cy = y + win_h * 0.5;
  cx >= wx && cx <= wx + ww && cy >= wy && cy <= wy + wh
}

fn clamp_restored_size(width: f64, height: f64, work_w: f64, work_h: f64) -> (f64, f64) {
  let max_w = (work_w - MARGIN).max(1.0).min(MAX_W);
  let max_h = (work_h - MARGIN).max(1.0).min(MAX_H);
  let min_w = MIN_W.min(max_w);
  let min_h = MIN_H.min(max_h);
  (
    width.clamp(min_w, max_w).round(),
    height.clamp(min_h, max_h).round(),
  )
}

fn apply_size(window: &WebviewWindow, w: f64, h: f64) {
  let _ = window.set_size(LogicalSize::new(w, h));
}

fn apply_position(window: &WebviewWindow, x: f64, y: f64) {
  let _ = window.set_position(LogicalPosition::new(x, y));
}

/// 启动时：有记忆则恢复；否则按屏比例开窗并居中。最后再 show，避免尺寸闪一下。
pub fn apply_on_startup(app: &AppHandle) {
  let Some(window) = app.get_webview_window("main") else {
    return;
  };

  let work = logical_work_area(&window);
  let restored = load_state(app);

  match (restored, work) {
    (Some(state), Some(work)) => {
      let (_, _, ww, wh) = work;
      let (w, h) = clamp_restored_size(state.width, state.height, ww, wh);
      apply_size(&window, w, h);

      let use_saved_pos = match (state.x, state.y) {
        (Some(x), Some(y)) if position_on_work_area(x, y, work, w, h) => Some((x, y)),
        _ => None,
      };
      if let Some((x, y)) = use_saved_pos {
        apply_position(&window, x, y);
      } else {
        let _ = window.center();
      }

      if state.maximized {
        let _ = window.maximize();
      }
    }
    (Some(state), None) => {
      apply_size(
        &window,
        state.width.max(MIN_W).min(MAX_W),
        state.height.max(MIN_H).min(MAX_H),
      );
      if state.maximized {
        let _ = window.maximize();
      } else {
        let _ = window.center();
      }
    }
    (_, Some((_, _, ww, wh))) => {
      let (w, h) = fit_window_size(ww, wh);
      apply_size(&window, w, h);
      let _ = window.center();
    }
    _ => {
      apply_size(&window, 1280.0, 800.0);
      let _ = window.center();
    }
  }

  let _ = window.show();
  let _ = window.set_focus();
}

fn capture_state(window: &WebviewWindow) -> Option<WindowState> {
  let scale = window.scale_factor().ok()?.max(0.1);
  let maximized = window.is_maximized().ok()?;

  // 最大化时只更新标志，保留文件里已有的正常尺寸
  if maximized {
    let mut state = load_state(&window.app_handle()).unwrap_or(WindowState {
      width: 1280.0,
      height: 800.0,
      x: None,
      y: None,
      maximized: true,
    });
    state.maximized = true;
    return Some(state);
  }

  let size: PhysicalSize<u32> = window.outer_size().ok()?;
  let pos: PhysicalPosition<i32> = window.outer_position().ok()?;
  Some(WindowState {
    width: size.width as f64 / scale,
    height: size.height as f64 / scale,
    x: Some(pos.x as f64 / scale),
    y: Some(pos.y as f64 / scale),
    maximized: false,
  })
}

/// 尺寸/位置变化时写入记忆；关闭前也会再抓一次。
pub fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
  match event {
    WindowEvent::Resized(_) | WindowEvent::Moved(_) | WindowEvent::CloseRequested { .. } => {
      let Some(webview) = window.app_handle().get_webview_window(window.label()) else {
        return;
      };
      if let Some(state) = capture_state(&webview) {
        save_state(&window.app_handle(), &state);
      }
    }
    _ => {}
  }
}

/// 进程退出前再落一次盘（防最后一次拖动没写上）
pub fn on_run_event(app: &AppHandle, event: &RunEvent) {
  if let RunEvent::Exit = event {
    if let Some(window) = app.get_webview_window("main") {
      if let Some(state) = capture_state(&window) {
        save_state(app, &state);
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::fit_window_size;

  #[test]
  fn laptop_1366_uses_high_ratio() {
    let (w, h) = fit_window_size(1366.0, 700.0);
    assert!(w >= 1000.0 && w <= 1200.0, "w={w}");
    assert!(h >= 560.0 && h <= 650.0, "h={h}");
  }

  #[test]
  fn desktop_1080_mid_ratio() {
    let (w, h) = fit_window_size(1920.0, 1040.0);
    assert!((w - 1440.0).abs() < 2.0, "w={w}");
    assert!((h - 832.0).abs() < 2.0, "h={h}");
  }

  #[test]
  fn display_2k_capped() {
    let (w, h) = fit_window_size(2560.0, 1400.0);
    assert!(w <= 1920.0, "w={w}");
    assert!(h <= 1200.0, "h={h}");
    assert!(w >= 1700.0, "w={w}");
  }

  #[test]
  fn tiny_screen_does_not_overflow() {
    let (w, h) = fit_window_size(1024.0, 600.0);
    assert!(w <= 1000.0, "w={w}");
    assert!(h <= 576.0, "h={h}");
  }
}
