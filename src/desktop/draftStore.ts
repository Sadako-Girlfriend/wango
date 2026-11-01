/**
 * 草稿路径与浏览器内存仓：供附件桥 / 媒体 URL 共用，避免循环依赖。
 */

const memoryStore = new Map<string, Uint8Array>();

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function memoryPut(relPath: string, data: Uint8Array) {
  memoryStore.set(relPath, data);
}

export function memoryGet(relPath: string): Uint8Array | undefined {
  return memoryStore.get(relPath);
}

export function memoryDelete(relPath: string) {
  memoryStore.delete(relPath);
}

export async function getAppDataDir(): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("app_data_dir");
}

export function joinPath(...parts: string[]): string {
  return parts.join("/").replace(/\\/g, "/").replace(/\/+/g, "/");
}

export async function resolveDraftPath(relPath: string): Promise<string> {
  const root = await getAppDataDir();
  return joinPath(root, relPath);
}
