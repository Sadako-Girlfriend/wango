//! 桌面文件相关 command：路径与草稿目录，不做 .wango 业务解析。

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::Manager;

static IMPORT_SEQ: AtomicU64 = AtomicU64::new(0);

/// 返回应用数据目录，供前端落附件草稿
#[tauri::command]
pub fn app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

/// 拖入文件落盘：绕过 plugin-fs 源路径 ACL，用系统拷贝进草稿目录。
/// 返回 `(源文件名, 相对路径 attachments/{id}/{name})` 列表。
#[tauri::command]
pub fn import_dropped_paths(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<Vec<(String, String)>, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();

    for src in paths {
        let src_path = PathBuf::from(&src);
        if !src_path.is_file() {
            continue;
        }
        let name = src_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("file")
            .replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "_");
        let id = unique_id();
        let rel = format!("attachments/{id}/{name}");
        let dest_dir = root.join("attachments").join(&id);
        fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
        let dest = dest_dir.join(&name);
        fs::copy(&src_path, &dest).map_err(|e| format!("拷贝失败 {}: {e}", src_path.display()))?;
        out.push((name, rel.replace('\\', "/")));
    }

    Ok(out)
}

fn unique_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let seq = IMPORT_SEQ.fetch_add(1, Ordering::Relaxed);
    format!("{ms:x}-{seq:x}")
}

/// 读任意路径字节（支持中文目录、空格；不走 plugin-fs ACL）
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    let p = PathBuf::from(path.trim());
    fs::read(&p).map_err(|e| format!("读取失败「{}」: {e}", p.display()))
}

/// 写任意路径字节（自动建父目录；支持中文目录、空格）
#[tauri::command]
pub fn write_file_bytes(path: String, data: Vec<u8>) -> Result<(), String> {
    let p = PathBuf::from(path.trim());
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建目录失败「{}」: {e}", parent.display()))?;
        }
    }
    fs::write(&p, &data).map_err(|e| format!("写入失败「{}」: {e}", p.display()))
}

/// 路径是否存在
#[tauri::command]
pub fn path_exists(path: String) -> Result<bool, String> {
    Ok(PathBuf::from(path.trim()).exists())
}

/// 删除本机文件（仅文件，不删目录）
#[tauri::command]
pub fn delete_file_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(path.trim());
    if !p.exists() {
        return Ok(());
    }
    if !p.is_file() {
        return Err(format!("不是文件，无法删除「{}」", p.display()));
    }
    fs::remove_file(&p).map_err(|e| format!("删除失败「{}」: {e}", p.display()))
}

/// 用系统默认程序打开本地路径（附件预览；空标题参数避免空格路径被拆）
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    let path = path.trim().to_string();
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err("当前平台暂不支持打开附件".into())
}
