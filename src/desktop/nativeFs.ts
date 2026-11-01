/**
 * 经 Rust 读写本机文件：支持中文目录与含空格路径。
 */

import { isTauriRuntime } from "./draftStore";
import { trimPath } from "./pathUtils";

export async function nativeReadBytes(path: string): Promise<Uint8Array> {
  if (!isTauriRuntime()) {
    throw new Error("仅桌面端支持按路径读取文件");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const data = await invoke<number[]>("read_file_bytes", {
    path: trimPath(path),
  });
  return Uint8Array.from(data);
}

export async function nativeWriteBytes(
  path: string,
  data: Uint8Array,
): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("仅桌面端支持按路径写入文件");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("write_file_bytes", {
    path: trimPath(path),
    data: Array.from(data),
  });
}

export async function nativeWriteText(path: string, text: string): Promise<void> {
  const bytes = new TextEncoder().encode(text);
  await nativeWriteBytes(path, bytes);
}

export async function nativeReadText(path: string): Promise<string> {
  const bytes = await nativeReadBytes(path);
  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // 去 BOM
  return text;
}

export async function nativePathExists(path: string): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("path_exists", { path: trimPath(path) });
}

/** 删除本机文件；浏览器预览不可用 */
export async function nativeDeleteFile(path: string): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("仅桌面端支持删除本机文件");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("delete_file_path", { path: trimPath(path) });
}
