/**
 * 内容图片导出：
 * - 单张：全树长图
 * - 多张按节点：每节点一图，不含子树
 * - 多张按大节点：根下第一层各一图，含子树
 */

import type { ProjectData, TreeNode } from "@/domain";
import {
  collectGlossaryColors,
  withNumbering,
  withNumberingFrom,
  type NumberedTreeNode,
} from "@/domain";
import {
  renderNumberedToPngBlob,
  type GlossaryExportPaint,
} from "./longImageCapture";

export type ContentImageMode = "long" | "batch-node" | "batch-major";

export type ContentImageItem = {
  /** 文件名（不含路径），如 1.1.png */
  fileName: string;
  blob: Blob;
};

export type ContentImageOptions = {
  /** 为 true 时不画词表引用高亮；默认 false */
  hideGlossaryStyles?: boolean;
};

function glossaryPaintOf(
  project: ProjectData,
  hide?: boolean,
): GlossaryExportPaint | undefined {
  if (hide) return undefined;
  const links = project.glossaryLinks ?? [];
  if (!links.length) return undefined;
  return {
    links,
    colors: collectGlossaryColors(project.glossary ?? []),
  };
}

function projectTitle(project: ProjectData): string {
  return (
    project.name.trim() ||
    project.tree[0]?.title?.trim() ||
    "未命名项目"
  );
}

function safeFileBase(number: string, title: string): string {
  const raw = `${number} ${title}`.trim() || number || "node";
  return raw
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\.+$/g, "")
    .slice(0, 80) || "node";
}

function flattenNumbered(nodes: NumberedTreeNode[]): NumberedTreeNode[] {
  const out: NumberedTreeNode[] = [];
  const walk = (list: NumberedTreeNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** 仅本节点（去掉 children）并保留编号 */
function aloneNumbered(node: NumberedTreeNode): NumberedTreeNode {
  const bare: TreeNode = {
    id: node.id,
    title: node.title,
    content: node.content,
    attachments: node.attachments,
    children: [],
    ...(node.priority ? { priority: node.priority } : {}),
    ...(node.labels?.length ? { labels: node.labels } : {}),
  };
  return withNumberingFrom(bare, node.number);
}

/** 单张：整棵树长图 */
export async function toLongTreePng(
  project: ProjectData,
  options?: ContentImageOptions,
): Promise<Blob> {
  const numbered = withNumbering(project.tree);
  return renderNumberedToPngBlob(
    numbered,
    projectTitle(project),
    glossaryPaintOf(project, options?.hideGlossaryStyles),
  );
}

/** 多张：每个节点一图，不含子树 */
export async function toBatchNodePngs(
  project: ProjectData,
  options?: ContentImageOptions,
): Promise<ContentImageItem[]> {
  const flat = flattenNumbered(withNumbering(project.tree));
  if (!flat.length) throw new Error("没有可导出的内容");
  const paint = glossaryPaintOf(project, options?.hideGlossaryStyles);
  const items: ContentImageItem[] = [];
  for (const node of flat) {
    const sheet = aloneNumbered(node);
    const title = `${sheet.number} ${sheet.title}`.trim();
    const blob = await renderNumberedToPngBlob([sheet], title, paint);
    items.push({
      fileName: `${safeFileBase(sheet.number, sheet.title)}.png`,
      blob,
    });
  }
  return items;
}

/** 多张：根级大节点各一图，含子树 */
export async function toBatchMajorPngs(
  project: ProjectData,
  options?: ContentImageOptions,
): Promise<ContentImageItem[]> {
  const roots = withNumbering(project.tree);
  if (!roots.length) throw new Error("没有可导出的内容");
  const paint = glossaryPaintOf(project, options?.hideGlossaryStyles);
  const items: ContentImageItem[] = [];
  for (const root of roots) {
    const title = `${root.number} ${root.title}`.trim();
    const blob = await renderNumberedToPngBlob([root], title, paint);
    items.push({
      fileName: `${safeFileBase(root.number, root.title)}.png`,
      blob,
    });
  }
  return items;
}
