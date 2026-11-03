/**
 * 运行时解析本机快捷键；设置保存后通知订阅者。
 */

import { getAppSettings } from "@/desktop/appSettings";
import { mergeHotkeys } from "./defaults";
import type { HotkeyMap } from "./types";

export function getResolvedHotkeys(): HotkeyMap {
  return mergeHotkeys(getAppSettings().hotkeys);
}

export { subscribeHotkeys, notifyHotkeysChanged } from "./listeners";
