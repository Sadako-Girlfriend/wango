/**
 * 词表引用自定义色：预设与样式字符串（装饰层 / 词表行共用）。
 */

import type { GlossaryNode, TreeNode } from "../types";
import { resolveGlossaryContent, resolveGlossaryTitle } from "./tree";

export function isGlossaryColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

/** 正文高亮 inline style：只铺背景，不改字色（避免浅色词条把字染没） */
export function glossaryLinkStyle(color: string | undefined): string | undefined {
  if (!color || !isGlossaryColor(color)) return undefined;
  return `background-color:color-mix(in srgb,${color} 28%,transparent);box-shadow:inset 0 -2px 0 color-mix(in srgb,${color} 55%,transparent)`;
}

/**
 * 拍平词表树 → entryId → 颜色。
 * 子节点未设色时继承最近祖先的自定义色。
 */
export function collectGlossaryColors(
  nodes: GlossaryNode[],
  out: Record<string, string> = {},
  inherited?: string,
): Record<string, string> {
  for (const n of nodes) {
    const own = n.color && isGlossaryColor(n.color) ? n.color : undefined;
    const color = own ?? inherited;
    if (color) out[n.id] = color;
    if (n.children.length) collectGlossaryColors(n.children, out, color);
  }
  return out;
}

/** 拍平词表树 → entryId → 展示标题（ref 从大纲实时取） */
export function collectGlossaryTitles(
  nodes: GlossaryNode[],
  tree: TreeNode[],
  out: Record<string, string> = {},
): Record<string, string> {
  for (const n of nodes) {
    out[n.id] = resolveGlossaryTitle(n, tree);
    if (n.children.length) collectGlossaryTitles(n.children, tree, out);
  }
  return out;
}

/** Markdown 正文抽纯文本预览（悬浮用） */
export function plainBodyPreview(markdown: string, maxLen = 180): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen).trimEnd()}…`;
}

/** 拍平词表树 → entryId → 正文预览 */
export function collectGlossaryBodyPreviews(
  nodes: GlossaryNode[],
  tree: TreeNode[],
  out: Record<string, string> = {},
): Record<string, string> {
  for (const n of nodes) {
    out[n.id] = plainBodyPreview(resolveGlossaryContent(n, tree));
    if (n.children.length) collectGlossaryBodyPreviews(n.children, tree, out);
  }
  return out;
}
