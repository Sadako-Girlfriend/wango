/**
 * 系统双击 / 命令行传入的 .wango：交给会话打开。
 * 依赖 Rust 单实例：已有进程则不新开窗口。
 */

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { loadWangoFromPath } from "./fileBridge";
import { isTauriRuntime } from "./draftStore";
import { useSessionStore } from "@/store/sessionStore";

/** 按路径打开一个或多个 .wango（已打开则切标签，不重复） */
export async function openWangoPaths(paths: string[]): Promise<void> {
  const store = useSessionStore.getState();
  for (const raw of paths) {
    const path = raw.trim();
    if (!path) continue;
    try {
      const loaded = await loadWangoFromPath(path);
      store.markLaunched();
      // openProjectTab 已按 filePath 去重：已打开则切到该标签
      store.openProjectTab({
        project: loaded.project,
        filePath: loaded.path,
      });
    } catch (err) {
      console.error(err);
      window.alert(
        err instanceof Error ? err.message : `打开失败：${path}`,
      );
    }
  }
}

export function isWangoPath(path: string): boolean {
  return /\.wango$/i.test(path.trim());
}

export interface OsOpenBindResult {
  unlisten: UnlistenFn | null;
  /** 本次冷启动是否消费了系统传入的 .wango */
  openedFromOs: boolean;
}

/** hydrate 完成后调用：消费冷启动参数，并监听二次双击 */
export async function bindOsWangoOpen(): Promise<OsOpenBindResult> {
  if (!isTauriRuntime()) {
    return { unlisten: null, openedFromOs: false };
  }

  let openedFromOs = false;
  try {
    const pending = await invoke<string[]>("take_pending_open_paths");
    if (pending?.length) {
      await openWangoPaths(pending);
      openedFromOs = true;
    }
  } catch (err) {
    console.error(err);
  }

  const unlisten = await listen<string[]>("open-wango-files", (event) => {
    const paths = event.payload ?? [];
    if (paths.length) void openWangoPaths(paths);
  });

  return { unlisten, openedFromOs };
}
