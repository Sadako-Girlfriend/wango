/**
 * 全局快捷键分发：读本机绑定，按焦点区过滤后回调。
 */

import { useEffect, useRef } from "react";
import { eventMatchesChord, HOTKEY_DEFS } from "./defaults";
import type { HotkeyId, HotkeyMap } from "./types";
import { getFocusZone } from "./focusZone";
import { getResolvedHotkeys, subscribeHotkeys } from "./runtime";

export type HotkeyHandlers = Partial<Record<HotkeyId, () => void>>;

function scopeOk(
  scope: (typeof HOTKEY_DEFS)[number]["scope"],
  zone: ReturnType<typeof getFocusZone>,
): boolean {
  if (scope === "global") return true;
  if (scope === "tree") return zone === "tree";
  if (scope === "outline") return zone === "tree" || zone === "editor";
  return false;
}

function isBlockedTarget(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  if (el.closest("[role='dialog']")) return true;
  if (el.closest("[data-wg-hotkey-ignore]")) return true;
  return false;
}

export function useAppHotkeys(
  enabled: boolean,
  handlers: HotkeyHandlers,
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    let map: HotkeyMap = getResolvedHotkeys();
    const unsub = subscribeHotkeys(() => {
      map = getResolvedHotkeys();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      const blocked = isBlockedTarget(e.target);
      const zone = getFocusZone();
      const t = e.target;
      const inField =
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement;

      for (const def of HOTKEY_DEFS) {
        // 弹层内仅放行审查统计（便于 F10 再关）
        if (blocked && def.id !== "statsToggle") continue;
        if (inField && def.scope !== "global") continue;
        if (!blocked && !inField && !scopeOk(def.scope, zone)) continue;
        if (!blocked && inField && def.scope !== "global") continue;
        const chord = map[def.id];
        if (!chord || !eventMatchesChord(e, chord)) continue;
        const fn = handlersRef.current[def.id];
        if (!fn) continue;
        e.preventDefault();
        e.stopPropagation();
        fn();
        return;
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      unsub();
    };
  }, [enabled]);
}
