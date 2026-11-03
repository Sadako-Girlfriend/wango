/**
 * 导出喂给 AI：遍历树，拼带层级标题的 Markdown。
 * 标题行附带已有优先级与文字标签（若有）。
 */

import type { NodePriority, TreeNode } from "@/domain";
import { withNumbering, type NumberedTreeNode } from "@/domain";
import { sanitizeMarkdownContent } from "@/editor/sanitizeMarkdown";

export function toAiMarkdown(tree: TreeNode[]): string {
  const numbered = withNumbering(tree);
  const chunks: string[] = [];
  for (const node of numbered) {
    walk(node, 1, chunks);
  }
  return `${chunks.join("\n\n").trim()}\n`;
}

function walk(node: NumberedTreeNode, depth: number, chunks: string[]) {
  const level = Math.min(Math.max(depth, 1), 6);
  const hashes = "#".repeat(level);
  chunks.push(`${hashes} ${node.number} ${formatHeadingMeta(node)}`);
  const body = sanitizeMarkdownContent(node.content).trim();
  if (body) {
    chunks.push(body);
  }
  for (const child of node.children) {
    walk(child, depth + 1, chunks);
  }
}

/** 例：`登录 [高] #后端 #本周` */
export function formatHeadingMeta(node: {
  title: string;
  priority?: NodePriority | null;
  labels?: string[];
}): string {
  const title = node.title.trim() || "未命名";
  const bits: string[] = [title];
  const p = node.priority;
  if (p === "high") bits.push("[高]");
  else if (p === "medium") bits.push("[中]");
  else if (p === "low") bits.push("[低]");
  for (const lab of node.labels ?? []) {
    const s = lab.trim();
    if (s) bits.push(`#${s.replace(/\s+/g, "_")}`);
  }
  return bits.join(" ");
}
