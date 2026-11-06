/**
 * 当前获焦的 MathLive 字段，供符号面板插入模板。
 */

import type { MathfieldElement } from "mathlive";

let active: MathfieldElement | null = null;
const listeners = new Set<() => void>();

export function setActiveMathField(el: MathfieldElement | null): void {
  if (active === el) return;
  active = el;
  for (const fn of listeners) fn();
}

export function getActiveMathField(): MathfieldElement | null {
  return active;
}

export function subscribeActiveMathField(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 关掉 MathLive 自带虚拟键盘（我们用自己的符号面板） */
export function hideMathVirtualKeyboard(): void {
  try {
    const vk = (
      globalThis as {
        mathVirtualKeyboard?: { hide?: () => void; visible?: boolean };
      }
    ).mathVirtualKeyboard;
    vk?.hide?.();
  } catch {
    /* ignore */
  }
}

/**
 * 向当前公式插入 LaTeX。
 * selectionMode=placeholder：插完落在第一个空位，便于再点「分数」嵌进根号里。
 */
export function insertIntoActiveMath(latex: string): boolean {
  const mf = active;
  if (!mf || !latex) return false;
  hideMathVirtualKeyboard();
  try {
    mf.focus();
    hideMathVirtualKeyboard();
    const ok = mf.insert(latex, {
      focus: true,
      feedback: false,
      format: "latex",
      selectionMode: "placeholder",
    });
    hideMathVirtualKeyboard();
    return Boolean(ok);
  } catch {
    try {
      const ok = mf.executeCommand([
        "insert",
        latex,
        { focus: true, feedback: false, selectionMode: "placeholder" },
      ]);
      hideMathVirtualKeyboard();
      return Boolean(ok);
    } catch {
      return false;
    }
  }
}
