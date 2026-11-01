/**
 * 轻量 UI 多语言：字典 + t() + 订阅；不引入重型 i18n 库。
 */

import zhCN, { type MessageKey } from "./locales/zh-CN";
import en from "./locales/en";

export type Locale = "zh-CN" | "en";
export type { MessageKey };

const dicts: Record<Locale, Record<MessageKey, string>> = {
  "zh-CN": zhCN,
  en,
};

const STORAGE_KEY = "wango.locale";

function readStoredLocale(): Locale {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "zh-CN") return v;
  } catch {
    /* ignore */
  }
  return "zh-CN";
}

let locale: Locale =
  typeof window !== "undefined" ? readStoredLocale() : "zh-CN";

const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale) {
  if (next === locale) return;
  locale = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn());
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

type Vars = Record<string, string | number>;

/** 取文案；缺 key 时回退中文，再回退 key 本身 */
export function t(key: MessageKey, vars?: Vars): string {
  let text = dicts[locale][key] ?? dicts["zh-CN"][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return text;
}

export function templateNameKey(
  pluginId: string,
): MessageKey | null {
  if (pluginId === "template.empty") return "templates.empty.name";
  if (pluginId === "template.sample") return "templates.sample.name";
  return null;
}
