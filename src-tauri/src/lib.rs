//! 万构 Tauri 入口：只注册桌面能力，不承载树业务逻辑。

mod file_assoc;
mod file_io;
mod open_wango;
mod window_fit;

use open_wango::PendingOpenPaths;
use std::sync::Mutex;

#[tauri::command]
fn greet(name: &str) -> String {
  // 保留最小 command 便于联调；业务文件读写走 plugin-fs / dialog
  format!("你好，{}！万构已启动。", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default();

  // 单实例必须最先注册：二次双击把参数交给已有进程后退出
  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
      open_wango::forward_open_args(app, &args);
    }));
  }

  builder
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .manage(PendingOpenPaths(Mutex::new(
      open_wango::extract_wango_paths(&std::env::args().collect::<Vec<_>>()),
    )))
    .setup(|app| {
      // HKCU 静默注册 .wango（图标用 exe 内嵌 logo_2；无需安装）
      file_assoc::register_wango_association();
      // 按屏适配或恢复上次窗口，再显示（conf 里 visible=false）
      window_fit::apply_on_startup(app.handle());
      Ok(())
    })
    .on_window_event(|window, event| {
      window_fit::on_window_event(window, event);
    })
    .invoke_handler(tauri::generate_handler![
      greet,
      file_io::app_data_dir,
      file_io::open_path,
      file_io::import_dropped_paths,
      file_io::read_file_bytes,
      file_io::write_file_bytes,
      file_io::path_exists,
      file_io::delete_file_path,
      open_wango::take_pending_open_paths
    ])
    .build(tauri::generate_context!())
    .expect("构建万构失败")
    .run(|app_handle, event| {
      window_fit::on_run_event(app_handle, &event);
    });
}
