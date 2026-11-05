/**
 * 灵感生成后的树规范化：纠正模型常见结构错误。
 * - 标题去掉手写序号（界面编号由树位置派生）
 * - 父节点正文里的 ## x.y 拆成缺失子节点
 * - 「总览」单根下挂全书时，把各章提升到与总览同级
 */

import { createId, type TreeNode } from "@/domain";

function stripLeadingNumber(title: string): string {
  return String(title || "")
    .replace(/^\d+(?:\.\d+)*\s*[.、:：\-–—]?\s*/, "")
    .trim();
}

function cmpNum(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

function childNumKey(title: string): string | null {
  const m = String(title || "").match(/^(\d+(?:\.\d+)*)\b/);
  return m ? m[1] : null;
}

/** 按 ## 带序号标题切开 Markdown */
export function splitByNumberedHeadings(md: string): {
  intro: string;
  sections: { num: string; heading: string; body: string }[];
} {
  const text = String(md || "").replace(/\r\n/g, "\n");
  const re = /^##\s+(\d+(?:\.\d+)*)\s+(.+)$/gm;
  const matches = [...text.matchAll(re)];
  if (!matches.length) {
    return { intro: text.trim(), sections: [] };
  }
  const intro = text.slice(0, matches[0].index).trim();
  const sections = matches.map((m, i) => {
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    return {
      num: m[1],
      heading: m[2].trim(),
      body: text.slice(start, end).trim(),
    };
  });
  return { intro, sections };
}

function expandNode(node: TreeNode): TreeNode {
  const children = (node.children || []).map(expandNode);
  const { intro, sections } = splitByNumberedHeadings(node.content);

  if (!sections.length) {
    return {
      ...node,
      title: stripLeadingNumber(node.title) || node.title || "未命名",
      content: intro,
      children: children.map((c) => ({
        ...c,
        title: stripLeadingNumber(c.title) || c.title || "未命名",
      })),
    };
  }

  const byNum = new Map<string, TreeNode>();
  for (const c of children) {
    const key = childNumKey(c.title) || `id:${c.id}`;
    byNum.set(key, {
      ...c,
      title: stripLeadingNumber(c.title) || c.title || "未命名",
    });
  }

  for (const sec of sections) {
    if (byNum.has(sec.num)) {
      const existing = byNum.get(sec.num)!;
      if (!String(existing.content || "").trim() && sec.body) {
        byNum.set(sec.num, { ...existing, content: sec.body });
      }
      continue;
    }
    byNum.set(sec.num, {
      id: createId(),
      title: sec.heading || "未命名",
      content: sec.body,
      children: [],
      attachments: [],
    });
  }

  const ordered = [...byNum.entries()]
    .map(([key, n]) => ({ key, n }))
    .sort((a, b) => {
      const na = a.key.startsWith("id:") ? null : a.key;
      const nb = b.key.startsWith("id:") ? null : b.key;
      if (na && nb) return cmpNum(na, nb);
      if (na) return -1;
      if (nb) return 1;
      return 0;
    })
    .map((x) => x.n);

  return {
    ...node,
    title: stripLeadingNumber(node.title) || node.title || "未命名",
    content: intro,
    children: ordered,
  };
}

const OVERVIEW_TITLE_RE =
  /总览|概述|目录|大纲|完整设计|overview|table\s*of\s*contents|\btoc\b/i;

/** 单根「总览」下挂多章时，提升到与总览同级 */
export function liftOverviewWrapper(tree: TreeNode[]): TreeNode[] {
  if (tree.length !== 1) return tree;
  const root = tree[0];
  const kids = root.children || [];
  if (kids.length < 3) return tree;
  if (!OVERVIEW_TITLE_RE.test(root.title)) return tree;
  return [
    { ...root, children: [] },
    ...kids,
  ];
}

/** 灵感结果规范化（不可变：返回新树） */
export function normalizeInspireTree(tree: TreeNode[]): TreeNode[] {
  const expanded = tree.map(expandNode);
  return liftOverviewWrapper(expanded);
}
