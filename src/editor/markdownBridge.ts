/**
 * 编辑器适配约定：对外只认 Markdown 字符串。
 * TipTap 细节留在 EditorView，业务层勿直接 import TipTap 扩展。
 */

export type MarkdownContent = string;

export function normalizeMarkdown(value: string | null | undefined): MarkdownContent {
  return value ?? "";
}
