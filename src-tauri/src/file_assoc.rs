//! 启动时静默注册 .wango 文件关联（仅 HKCU，无需安装/管理员）。
//! 图标用当前 exe 内嵌图标（已是 logo_2）；并挂双击打开。

#[cfg(windows)]
mod windows_impl {
  use std::path::PathBuf;
  use winreg::enums::*;
  use winreg::RegKey;

  const EXT: &str = ".wango";
  const PROGID: &str = "WanGou.wango";
  const TYPE_NAME: &str = "万构项目";

  fn exe_path() -> Option<PathBuf> {
    let raw = std::env::current_exe().ok()?;
    let canon = raw.canonicalize().unwrap_or(raw);
    // canonicalize 在 Windows 上可能带 \\?\ 前缀，注册表图标路径不能用
    let s = canon.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
      Some(PathBuf::from(stripped))
    } else {
      Some(canon)
    }
  }

  fn set_default(key: &RegKey, value: &str) -> std::io::Result<()> {
    key.set_value("", &value)
  }

  fn read_default(key: &RegKey) -> Option<String> {
    key.get_value::<String, _>("").ok()
  }

  /// 若已是正确关联则跳过写入；有变更时通知资源管理器刷新图标。
  pub fn register_wango_association() {
    let Some(exe) = exe_path() else {
      eprintln!("[wango] 无法解析当前 exe，跳过 .wango 关联注册");
      return;
    };
    let exe_str = exe.to_string_lossy();
    // Windows 路径里反斜杠即可；DefaultIcon 用 exe,0 取内嵌图标
    let icon_value = format!("{exe_str},0");
    let open_cmd = format!("\"{exe_str}\" \"%1\"");

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let classes = match hkcu.create_subkey("Software\\Classes") {
      Ok((k, _)) => k,
      Err(err) => {
        eprintln!("[wango] 打开 HKCU\\Software\\Classes 失败: {err}");
        return;
      }
    };

    let mut changed = false;

    // .wango → ProgID
    match classes.create_subkey(EXT) {
      Ok((ext_key, _)) => {
        if read_default(&ext_key).as_deref() != Some(PROGID) {
          if let Err(err) = set_default(&ext_key, PROGID) {
            eprintln!("[wango] 写入 {EXT} 失败: {err}");
            return;
          }
          changed = true;
        }
        let _ = ext_key.set_value("Content Type", &"application/vnd.wango");
      }
      Err(err) => {
        eprintln!("[wango] 创建 {EXT} 失败: {err}");
        return;
      }
    }

    // ProgID + DefaultIcon + open
    let prog = match classes.create_subkey(PROGID) {
      Ok((k, _)) => k,
      Err(err) => {
        eprintln!("[wango] 创建 {PROGID} 失败: {err}");
        return;
      }
    };
    if read_default(&prog).as_deref() != Some(TYPE_NAME) {
      if set_default(&prog, TYPE_NAME).is_ok() {
        changed = true;
      }
    }

    match prog.create_subkey("DefaultIcon") {
      Ok((icon_key, _)) => {
        if read_default(&icon_key).as_deref() != Some(icon_value.as_str()) {
          if let Err(err) = set_default(&icon_key, &icon_value) {
            eprintln!("[wango] 写入 DefaultIcon 失败: {err}");
            return;
          }
          changed = true;
        }
      }
      Err(err) => {
        eprintln!("[wango] 创建 DefaultIcon 失败: {err}");
        return;
      }
    }

    match prog.create_subkey("shell\\open\\command") {
      Ok((cmd_key, _)) => {
        if read_default(&cmd_key).as_deref() != Some(open_cmd.as_str()) {
          if let Err(err) = set_default(&cmd_key, &open_cmd) {
            eprintln!("[wango] 写入 open command 失败: {err}");
            return;
          }
          changed = true;
        }
      }
      Err(err) => {
        eprintln!("[wango] 创建 open command 失败: {err}");
        return;
      }
    }

    if changed {
      notify_assoc_changed();
      eprintln!("[wango] 已注册 .wango 文件关联（图标 + 打开）");
    }
  }

  fn notify_assoc_changed() {
    // SHCNE_ASSOCCHANGED = 0x08000000, SHCNF_IDLIST = 0
    #[link(name = "shell32")]
    unsafe extern "system" {
      fn SHChangeNotify(event: i32, flags: u32, item1: isize, item2: isize);
    }
    unsafe {
      SHChangeNotify(0x0800_0000, 0, 0, 0);
    }
  }
}

#[cfg(windows)]
pub use windows_impl::register_wango_association;

#[cfg(not(windows))]
pub fn register_wango_association() {
  // 非 Windows：无资源管理器扩展名图标机制，空操作
}
