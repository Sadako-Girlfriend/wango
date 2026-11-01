/**
 * 导出纯思维导图：只取 title，生成 markmap 兼容的列表 Markdown。
 */

import type { TreeNode } from "@/domain";
import { t } from "@/i18n";

export function toMindmapMarkdown(tree: TreeNode[]): string {
  const lines: string[] = [`# ${t("export.mindmapHeading")}`, ""];
  for (const node of tree) {
    walk(node, 0, lines);
  }
  return `${lines.join("\n").trim()}\n`;
}

function walk(node: TreeNode, depth: number, lines: string[]) {
  const indent = "  ".repeat(depth);
  lines.push(`${indent}- ${node.title}`);
  for (const child of node.children) {
    walk(child, depth + 1, lines);
  }
}
