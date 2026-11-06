/**
 * 按光标上下文插入行内或块级公式。
 * 段内已有内容 → mathInline（跟在文字后不换行）；空段 → mathBlock。
 */

import type { Editor } from "@tiptap/core";

export function isMathNodeActive(editor: Editor): boolean {
  return editor.isActive("mathBlock") || editor.isActive("mathInline");
}

/** 当前段能否、且应该插行内公式 */
export function shouldInsertMathInline(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  const parent = $from.parent;
  if (!parent.isTextblock) return false;
  if (!editor.schema.nodes.mathInline) return false;
  // 空段 → 块级；段内已有内容（含仅空白以外的节点）→ 行内
  if (parent.content.size > 0) return true;
  return $from.parentOffset > 0;
}

/**
 * 插入空公式并打开编辑。
 * @returns 是否插入成功（已在公式内时返回 false，由调用方改开面板）
 */
export function insertMathAtCursor(
  editor: Editor,
  attrs?: { latex?: string },
): boolean {
  if (isMathNodeActive(editor)) return false;
  const latex = attrs?.latex ?? "";
  if (shouldInsertMathInline(editor)) {
    return editor
      .chain()
      .focus()
      .insertContent({ type: "mathInline", attrs: { latex } })
      .run();
  }
  return editor
    .chain()
    .focus()
    .insertContent([
      { type: "mathBlock", attrs: { latex } },
      { type: "paragraph" },
    ])
    .run();
}

export function focusLastMathField(): HTMLElement | null {
  const fields = document.querySelectorAll<HTMLElement>("math-field");
  const last = fields[fields.length - 1] ?? null;
  last?.focus();
  return last;
}
