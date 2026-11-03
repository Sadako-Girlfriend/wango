/**
 * 本机应用设置（含 API Key）。只写 appData / localStorage，绝不进 .wango / 会话文档。
 */

import { isTauriRuntime, getAppDataDir, joinPath } from "./draftStore";
import { parentDir } from "./pathUtils";
import { mergeHotkeys } from "@/hotkeys/defaults";
import { notifyHotkeysChanged } from "@/hotkeys/listeners";
import type { HotkeyId, HotkeyMap } from "@/hotkeys/types";

export const APP_SETTINGS_SCHEMA = 1 as const;

export interface AppSettings {
  schema: typeof APP_SETTINGS_SCHEMA;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  /** 导出长图 PDF / 内容图时不显示右下角品牌标 */
  hideExportWatermark: boolean;
  /** 导出对话框默认目录（仅本机；空则回退到工程所在目录） */
  defaultExportDir: string;
  /** 引用为词条防懵提示：勾选不再提示 */
  hideGlossaryRefTip: boolean;
  /** 左栏词表区高度占比 0.15–0.7 */
  glossaryPaneRatio: number;
  /** 左栏（大纲+词表）宽度像素 */
  treePaneWidth: number;
  /** 左栏是否收起 */
  treePaneCollapsed: boolean;
  /** 右侧 Agent 是否展开（首启默认开；之后跟用户） */
  agentPaneOpen: boolean;
  /** 右侧 Agent 宽度像素 */
  agentPaneWidth: number;
  /** 快捷键覆盖（缺省用默认表） */
  hotkeys: HotkeyMap;
}

export const TREE_PANE_WIDTH_MIN = 220;
export const TREE_PANE_WIDTH_MAX = 560;
export const TREE_PANE_WIDTH_DEFAULT = 320;

export const AGENT_PANE_WIDTH_MIN = 280;
export const AGENT_PANE_WIDTH_MAX = 520;
export const AGENT_PANE_WIDTH_DEFAULT = 360;

const LS_KEY = "wango.settings.v1";
const REL_FILE = "settings/settings.json";

let cached: AppSettings | null = null;

export function emptyAppSettings(): AppSettings {
  return {
    schema: APP_SETTINGS_SCHEMA,
    apiBaseUrl: "",
    apiKey: "",
    model: "",
    hideExportWatermark: false,
    defaultExportDir: "",
    hideGlossaryRefTip: false,
    glossaryPaneRatio: 0.32,
    treePaneWidth: TREE_PANE_WIDTH_DEFAULT,
    treePaneCollapsed: false,
    agentPaneOpen: true,
    agentPaneWidth: AGENT_PANE_WIDTH_DEFAULT,
    hotkeys: mergeHotkeys(null),
  };
}

function normalizeHotkeys(raw: unknown): HotkeyMap {
  if (!raw || typeof raw !== "object") return mergeHotkeys(null);
  return mergeHotkeys(raw as Partial<Record<HotkeyId, string>>);
}

function clampRatio(n: number): number {
  if (!Number.isFinite(n)) return 0.32;
  return Math.min(0.7, Math.max(0.15, n));
}

export function clampTreePaneWidth(n: number): number {
  if (!Number.isFinite(n)) return TREE_PANE_WIDTH_DEFAULT;
  return Math.min(
    TREE_PANE_WIDTH_MAX,
    Math.max(TREE_PANE_WIDTH_MIN, Math.round(n)),
  );
}

export function clampAgentPaneWidth(n: number): number {
  if (!Number.isFinite(n)) return AGENT_PANE_WIDTH_DEFAULT;
  return Math.min(
    AGENT_PANE_WIDTH_MAX,
    Math.max(AGENT_PANE_WIDTH_MIN, Math.round(n)),
  );
}

function normalize(raw: unknown): AppSettings {
  const empty = emptyAppSettings();
  if (!raw || typeof raw !== "object") return empty;
  const o = raw as Partial<AppSettings>;
  return {
    schema: APP_SETTINGS_SCHEMA,
    apiBaseUrl: typeof o.apiBaseUrl === "string" ? o.apiBaseUrl : "",
    apiKey: typeof o.apiKey === "string" ? o.apiKey : "",
    model: typeof o.model === "string" ? o.model : "",
    hideExportWatermark: o.hideExportWatermark === true,
    defaultExportDir:
      typeof o.defaultExportDir === "string" ? o.defaultExportDir.trim() : "",
    hideGlossaryRefTip: o.hideGlossaryRefTip === true,
    glossaryPaneRatio: clampRatio(
      typeof o.glossaryPaneRatio === "number" ? o.glossaryPaneRatio : 0.32,
    ),
    treePaneWidth: clampTreePaneWidth(
      typeof o.treePaneWidth === "number"
        ? o.treePaneWidth
        : TREE_PANE_WIDTH_DEFAULT,
    ),
    treePaneCollapsed: o.treePaneCollapsed === true,
    // 缺省字段：首启 / 升级后默认打开 Agent
    agentPaneOpen:
      (o as { agentPaneOpen?: unknown }).agentPaneOpen === undefined
        ? true
        : (o as { agentPaneOpen?: unknown }).agentPaneOpen === true,
    agentPaneWidth: clampAgentPaneWidth(
      typeof (o as { agentPaneWidth?: unknown }).agentPaneWidth === "number"
        ? ((o as { agentPaneWidth: number }).agentPaneWidth)
        : AGENT_PANE_WIDTH_DEFAULT,
    ),
    hotkeys: normalizeHotkeys(
      (o as { hotkeys?: unknown }).hotkeys,
    ),
  };
}

/** 同步取缓存（需先 await loadAppSettings） */
export function getAppSettings(): AppSettings {
  return cached ?? emptyAppSettings();
}

/**
 * 导出对话框默认路径：优先本机「默认导出目录」，否则用工程文件路径记忆。
 * 返回值可直接交给 pickSave（文件路径或目录+文件名由调用方拼）。
 */
export function resolveExportDefaultPath(
  fileName: string,
  lastFileOrDir?: string | null,
): string {
  const pref = getAppSettings().defaultExportDir.trim();
  if (pref) {
    const sep = pref.includes("\\") ? "\\" : "/";
    const base = pref.replace(/[\\/]+$/, "");
    return `${base}${sep}${fileName}`;
  }
  if (lastFileOrDir?.trim()) return lastFileOrDir.trim();
  return fileName;
}

/** 批量导出选文件夹时的 defaultPath */
export function resolveExportDefaultDir(
  lastFileOrDir?: string | null,
): string | undefined {
  const pref = getAppSettings().defaultExportDir.trim();
  if (pref) return pref;
  return parentDir(lastFileOrDir ?? undefined) ?? undefined;
}

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    if (isTauriRuntime()) {
      const { readTextFile, exists, mkdir } = await import(
        "@tauri-apps/plugin-fs"
      );
      const root = await getAppDataDir();
      await mkdir(joinPath(root, "settings"), { recursive: true });
      const abs = joinPath(root, REL_FILE);
      if (!(await exists(abs))) {
        cached = emptyAppSettings();
        return cached;
      }
      const text = await readTextFile(abs);
      cached = normalize(JSON.parse(text));
      return cached;
    }
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      cached = emptyAppSettings();
      return cached;
    }
    cached = normalize(JSON.parse(raw));
    return cached;
  } catch (err) {
    console.warn("读取本机设置失败，使用默认", err);
    cached = emptyAppSettings();
    return cached;
  }
}

export async function saveAppSettings(
  next: Omit<AppSettings, "schema"> | AppSettings,
): Promise<AppSettings> {
  const payload: AppSettings = {
    schema: APP_SETTINGS_SCHEMA,
    apiBaseUrl: next.apiBaseUrl.trim(),
    apiKey: next.apiKey,
    model: next.model.trim(),
    hideExportWatermark: next.hideExportWatermark === true,
    defaultExportDir: (next.defaultExportDir ?? "").trim(),
    hideGlossaryRefTip: next.hideGlossaryRefTip === true,
    glossaryPaneRatio: clampRatio(
      typeof next.glossaryPaneRatio === "number"
        ? next.glossaryPaneRatio
        : 0.32,
    ),
    treePaneWidth: clampTreePaneWidth(
      typeof next.treePaneWidth === "number"
        ? next.treePaneWidth
        : getAppSettings().treePaneWidth,
    ),
    treePaneCollapsed: next.treePaneCollapsed === true,
    agentPaneOpen: next.agentPaneOpen !== false,
    agentPaneWidth: clampAgentPaneWidth(
      typeof next.agentPaneWidth === "number"
        ? next.agentPaneWidth
        : getAppSettings().agentPaneWidth,
    ),
    hotkeys: normalizeHotkeys(
      (next as AppSettings).hotkeys ?? getAppSettings().hotkeys,
    ),
  };
  const body = JSON.stringify(payload);
  if (isTauriRuntime()) {
    const { writeTextFile, mkdir } = await import("@tauri-apps/plugin-fs");
    const root = await getAppDataDir();
    await mkdir(joinPath(root, "settings"), { recursive: true });
    await writeTextFile(joinPath(root, REL_FILE), body);
  } else {
    localStorage.setItem(LS_KEY, body);
  }
  cached = payload;
  notifyHotkeysChanged();
  return payload;
}
