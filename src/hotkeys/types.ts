/**
 * 本机快捷键：动作 id、作用域、键位串。
 * 键位串如 "Ctrl+Enter" | "Alt+1" | "ArrowUp" | "F10"（Mod = Ctrl 或 Meta）。
 */

export type HotkeyId =
  | "addChild"
  | "addSibling"
  | "focusTree"
  | "focusEditor"
  | "focusGlossary"
  | "selectPrev"
  | "selectNext"
  | "promote"
  | "demote"
  | "toggleCollapse"
  | "statsToggle";

/** tree = 仅树列表聚焦；outline = 树或正文；global = 有项目即可 */
export type HotkeyScope = "tree" | "outline" | "global";

export interface HotkeyDef {
  id: HotkeyId;
  scope: HotkeyScope;
  /** i18n key */
  labelKey: string;
}

export type HotkeyMap = Record<HotkeyId, string>;
