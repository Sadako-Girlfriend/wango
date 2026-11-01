/**
 * 会话持久化：tab 草稿 + 历史 + 启动标记。
 * Tauri 写应用数据目录；浏览器预览走 localStorage。
 */

import type { ProjectData } from "@/domain";
import { isTauriRuntime, getAppDataDir, joinPath } from "./draftStore";

export const SESSION_SCHEMA = 1 as const;

export interface PersistedTab {
  id: string;
  project: ProjectData;
  selectedId: string | null;
  collapsedIds: Record<string, true>;
  searchQuery: string;
  filePath: string | null;
  revision: number;
  syncedRevision: number;
  touched: boolean;
}

export interface RecentEntry {
  /** 稳定键：优先 filePath，否则 tab/draft id */
  key: string;
  title: string;
  filePath: string | null;
  /** 无路径时用于从会话草稿恢复 */
  draftTabId: string | null;
  lastOpenedAt: number;
}

export interface SessionPersistPayload {
  schema: typeof SESSION_SCHEMA;
  hasLaunchedBefore: boolean;
  activeTabId: string | null;
  tabs: PersistedTab[];
  recents: RecentEntry[];
}

const LS_KEY = "wango.session.v1";
const REL_FILE = "session/session.json";

export function emptySessionPersist(): SessionPersistPayload {
  return {
    schema: SESSION_SCHEMA,
    hasLaunchedBefore: false,
    activeTabId: null,
    tabs: [],
    recents: [],
  };
}

export async function loadSessionPersist(): Promise<SessionPersistPayload> {
  try {
    if (isTauriRuntime()) {
      const { readTextFile, exists, mkdir } = await import("@tauri-apps/plugin-fs");
      const root = await getAppDataDir();
      const dir = joinPath(root, "session");
      await mkdir(dir, { recursive: true });
      const abs = joinPath(root, REL_FILE);
      if (!(await exists(abs))) return emptySessionPersist();
      const text = await readTextFile(abs);
      return normalizePayload(JSON.parse(text));
    }
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return emptySessionPersist();
    return normalizePayload(JSON.parse(raw));
  } catch (err) {
    console.warn("读取会话失败，使用空会话", err);
    return emptySessionPersist();
  }
}

export async function saveSessionPersist(
  payload: SessionPersistPayload,
): Promise<void> {
  const body = JSON.stringify(payload);
  if (isTauriRuntime()) {
    const { writeTextFile, mkdir } = await import("@tauri-apps/plugin-fs");
    const root = await getAppDataDir();
    await mkdir(joinPath(root, "session"), { recursive: true });
    await writeTextFile(joinPath(root, REL_FILE), body);
    return;
  }
  localStorage.setItem(LS_KEY, body);
}

function normalizePayload(raw: unknown): SessionPersistPayload {
  const empty = emptySessionPersist();
  if (!raw || typeof raw !== "object") return empty;
  const o = raw as Partial<SessionPersistPayload>;
  return {
    schema: SESSION_SCHEMA,
    hasLaunchedBefore: Boolean(o.hasLaunchedBefore),
    activeTabId: o.activeTabId ?? null,
    tabs: Array.isArray(o.tabs) ? (o.tabs as PersistedTab[]) : [],
    recents: Array.isArray(o.recents) ? (o.recents as RecentEntry[]) : [],
  };
}
