/**
 * 附件 / 正文内嵌媒体：收集路径，不碰磁盘。
 */

import type { AttachmentMeta, TreeNode } from "./types";

const INLINE_MD_RE = /!\[[^\]]*\]\((attachments\/[^)\s]+)\)/g;
const INLINE_HTML_RE = /<img\b[^>]*\bsrc=["'](attachments\/[^"']+)["']/gi;

/** 深度遍历收集附件栏元数据（按 relPath 去重） */
export function collectAttachments(tree: TreeNode[]): AttachmentMeta[] {
  const map = new Map<string, AttachmentMeta>();
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      for (const a of node.attachments) {
        map.set(a.relPath, a);
      }
      walk(node.children);
    }
  };
  walk(tree);
  return [...map.values()];
}

/** 从正文收集内嵌图相对路径（Markdown + HTML img） */
export function collectInlineMediaPaths(tree: TreeNode[]): string[] {
  const set = new Set<string>();
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      for (const m of node.content.matchAll(INLINE_MD_RE)) set.add(m[1]);
      for (const m of node.content.matchAll(INLINE_HTML_RE)) set.add(m[1]);
      walk(node.children);
    }
  };
  walk(tree);
  return [...set];
}

/** 导出打包所需的全部相对路径（附件栏 + 正文图） */
export function collectAllMediaRelPaths(tree: TreeNode[]): string[] {
  const set = new Set<string>();
  for (const a of collectAttachments(tree)) set.add(a.relPath);
  for (const p of collectInlineMediaPaths(tree)) set.add(p);
  return [...set];
}

export function hasAttachments(tree: TreeNode[]): boolean {
  return collectAllMediaRelPaths(tree).length > 0;
}
