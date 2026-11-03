import type { HotkeyDef, HotkeyId, HotkeyMap } from "./types";

export const HOTKEY_DEFS: HotkeyDef[] = [
  { id: "addChild", scope: "outline", labelKey: "hotkeys.addChild" },
  { id: "addSibling", scope: "outline", labelKey: "hotkeys.addSibling" },
  { id: "focusTree", scope: "global", labelKey: "hotkeys.focusTree" },
  { id: "focusEditor", scope: "global", labelKey: "hotkeys.focusEditor" },
  { id: "focusGlossary", scope: "global", labelKey: "hotkeys.focusGlossary" },
  { id: "selectPrev", scope: "tree", labelKey: "hotkeys.selectPrev" },
  { id: "selectNext", scope: "tree", labelKey: "hotkeys.selectNext" },
  { id: "promote", scope: "tree", labelKey: "hotkeys.promote" },
  { id: "demote", scope: "tree", labelKey: "hotkeys.demote" },
  { id: "toggleCollapse", scope: "tree", labelKey: "hotkeys.toggleCollapse" },
  { id: "statsToggle", scope: "global", labelKey: "hotkeys.statsToggle" },
];

/** 默认：避开 Ctrl+Tab（系统切标签）；子节点用 Ctrl+] */
export const DEFAULT_HOTKEYS: HotkeyMap = {
  addChild: "Ctrl+]",
  addSibling: "Ctrl+Enter",
  focusTree: "Alt+1",
  focusEditor: "Alt+2",
  focusGlossary: "Alt+3",
  selectPrev: "ArrowUp",
  selectNext: "ArrowDown",
  promote: "ArrowLeft",
  demote: "ArrowRight",
  toggleCollapse: "Enter",
  statsToggle: "F10",
};

export function mergeHotkeys(
  partial?: Partial<Record<HotkeyId, string>> | null,
): HotkeyMap {
  const out = { ...DEFAULT_HOTKEYS };
  if (!partial) return out;
  // 旧版「同级移动」键位迁移为选中上下项
  const legacy = partial as Partial<Record<string, string>>;
  if (!partial.selectPrev && typeof legacy.moveUp === "string") {
    out.selectPrev = normalizeChord(legacy.moveUp);
  }
  if (!partial.selectNext && typeof legacy.moveDown === "string") {
    out.selectNext = normalizeChord(legacy.moveDown);
  }
  for (const def of HOTKEY_DEFS) {
    const v = partial[def.id];
    if (typeof v === "string" && v.trim()) out[def.id] = normalizeChord(v);
  }
  return out;
}

/** 规范化显示/存储：Ctrl/Alt/Shift/Meta + Key */
export function normalizeChord(raw: string): string {
  const parts = raw
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  const mods = new Set<string>();
  let key = "";
  for (const p of parts) {
    const low = p.toLowerCase();
    if (low === "ctrl" || low === "control" || low === "mod") mods.add("Ctrl");
    else if (low === "alt" || low === "option") mods.add("Alt");
    else if (low === "shift") mods.add("Shift");
    else if (low === "meta" || low === "cmd" || low === "command" || low === "win")
      mods.add("Meta");
    else key = canonicalizeKey(p);
  }
  if (!key) return "";
  const order = ["Ctrl", "Alt", "Shift", "Meta"].filter((m) => mods.has(m));
  return [...order, key].join("+");
}

function canonicalizeKey(k: string): string {
  if (/^digit[0-9]$/i.test(k)) return k.slice(-1);
  if (/^[0-9]$/.test(k)) return k;
  const map: Record<string, string> = {
    " ": "Space",
    spacebar: "Space",
    esc: "Escape",
    return: "Enter",
    arrowup: "ArrowUp",
    arrowdown: "ArrowDown",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight",
  };
  const low = k.toLowerCase();
  if (map[low]) return map[low];
  if (/^f\d{1,2}$/i.test(k)) return k.toUpperCase();
  if (k.length === 1) return k.toUpperCase();
  return k.length ? k[0]!.toUpperCase() + k.slice(1) : k;
}

export function chordFromEvent(e: KeyboardEvent): string | null {
  const key = e.key;
  if (!key || key === "Control" || key === "Alt" || key === "Shift" || key === "Meta") {
    return null;
  }
  const mods: string[] = [];
  // Digit keys: e.key is "1", code is Digit1
  let main = key;
  if (e.code?.startsWith("Digit")) main = e.code.slice(5);
  else if (e.code?.startsWith("Numpad") && /^\d$/.test(e.code.slice(6))) {
    main = e.code.slice(6);
  } else if (key === " ") main = "Space";
  else if (key.length === 1) main = key.toUpperCase();
  else main = key;

  // Ctrl+] : key may be "]" 
  if (e.ctrlKey || e.metaKey) mods.push(e.metaKey && !e.ctrlKey ? "Meta" : "Ctrl");
  // Prefer Ctrl when both (Windows)
  if (e.ctrlKey && e.metaKey) {
    mods.length = 0;
    mods.push("Ctrl");
  } else if (e.ctrlKey) {
    mods.length = 0;
    mods.push("Ctrl");
  } else if (e.metaKey) {
    mods.length = 0;
    mods.push("Meta");
  }
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");

  return normalizeChord([...mods, main].join("+"));
}

export function eventMatchesChord(e: KeyboardEvent, chord: string): boolean {
  const got = chordFromEvent(e);
  if (!got) return false;
  const want = normalizeChord(chord);
  if (got === want) return true;
  // Mod 互通：存 Ctrl+X 时 Meta+X 也命中（Mac）
  const alt = want.replace(/^Ctrl\+/, "Meta+");
  const alt2 = want.replace(/^Meta\+/, "Ctrl+");
  return got === alt || got === alt2;
}

export function findHotkeyConflicts(map: HotkeyMap): HotkeyId[][] {
  const byChord = new Map<string, HotkeyId[]>();
  for (const def of HOTKEY_DEFS) {
    const c = normalizeChord(map[def.id] || "");
    if (!c) continue;
    const list = byChord.get(c) ?? [];
    list.push(def.id);
    byChord.set(c, list);
  }
  return [...byChord.values()].filter((ids) => ids.length > 1);
}
