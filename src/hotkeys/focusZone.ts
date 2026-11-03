export type FocusZone = "tree" | "editor" | "glossary" | "other";

/** 根据 activeElement 判断万构焦点区 */
export function getFocusZone(): FocusZone {
  const el = document.activeElement;
  if (!el || !(el instanceof Element)) return "other";
  if (el.closest("[data-wg-focus='tree']")) return "tree";
  if (el.closest("[data-wg-focus='glossary']")) return "glossary";
  if (el.closest("[data-wg-focus='editor']")) return "editor";
  // 未标区的输入框（对话框、搜索等）
  if (
    el instanceof HTMLElement &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable)
  ) {
    return "other";
  }
  return "other";
}

export function focusZoneEl(zone: "tree" | "editor" | "glossary"): void {
  const el = document.querySelector(
    `[data-wg-focus='${zone}']`,
  ) as HTMLElement | null;
  if (!el) return;
  el.focus({ preventScroll: true });
  // 正文：尽量点进 ProseMirror
  if (zone === "editor") {
    const pm = el.querySelector(".ProseMirror") as HTMLElement | null;
    pm?.focus({ preventScroll: true });
  }
}
