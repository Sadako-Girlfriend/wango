/**
 * 正文审查统计（纯函数）。
 *
 * 边界：
 * - 只吃 Markdown 字符串 / TreeNode，不碰编辑器、store、i18n。
 * - 代码块、备注框按结构计数；字数/标点在「可读文本」上统计（去掉围栏与 HTML 标签）。
 */

import type { TreeNode } from "./types";

export interface ContentStats {
  /** 非空白字符数（含汉字、字母、数字、标点） */
  chars: number;
  /** 标点 / 符号数 */
  punctuation: number;
  /** 围栏代码块数量 */
  codeBlocks: number;
  /** 备注框（callout）数量 */
  callouts: number;
  /** 公式块数量 */
  mathBlocks: number;
}

export type StatsScope =
  | "nodeOnly"
  | "nodeWithChildren"
  | "all"
  | "selection";

export const EMPTY_STATS: ContentStats = {
  chars: 0,
  punctuation: 0,
  codeBlocks: 0,
  callouts: 0,
  mathBlocks: 0,
};

export function sumContentStats(list: ContentStats[]): ContentStats {
  return list.reduce(
    (acc, s) => ({
      chars: acc.chars + s.chars,
      punctuation: acc.punctuation + s.punctuation,
      codeBlocks: acc.codeBlocks + s.codeBlocks,
      callouts: acc.callouts + s.callouts,
      mathBlocks: acc.mathBlocks + s.mathBlocks,
    }),
    { ...EMPTY_STATS },
  );
}

/** 统计单段 Markdown 正文 */
export function analyzeMarkdown(md: string): ContentStats {
  if (!md) return { ...EMPTY_STATS };

  const callouts = countCallouts(md);
  const mathBlocks = countMathBlocks(md);
  const { count: codeBlocks, rest } = stripFencedCode(md);
  // 备注框：去掉外壳标签，保留内部文字参与字数
  const withoutCalloutTags = stripCalloutShells(rest);
  const withoutMath = stripMathBlocks(withoutCalloutTags);
  const plain = markdownToPlain(withoutMath);
  const chars = countNonWhitespace(plain);
  const punctuation = countPunctuation(plain);

  return { chars, punctuation, codeBlocks, callouts, mathBlocks };
}

/** 划词：纯文本为主；若来自代码块/备注框则结构计数至少为 1 */
export function analyzeSelection(
  text: string,
  block?: "text" | "code" | "callout" | "math" | null,
): ContentStats {
  const base = analyzeMarkdown(text);
  if (block === "code" && base.codeBlocks === 0) {
    return { ...base, codeBlocks: 1 };
  }
  if (block === "callout" && base.callouts === 0) {
    return { ...base, callouts: 1 };
  }
  if (block === "math" && base.mathBlocks === 0) {
    return { ...base, mathBlocks: 1 };
  }
  return base;
}

export function flattenNode(node: TreeNode): TreeNode[] {
  const out: TreeNode[] = [node];
  for (const c of node.children) out.push(...flattenNode(c));
  return out;
}

export function flattenTree(tree: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of tree) out.push(...flattenNode(n));
  return out;
}

export function analyzeNodes(nodes: TreeNode[]): ContentStats {
  return sumContentStats(nodes.map((n) => analyzeMarkdown(n.content ?? "")));
}

/**
 * 按范围统计。
 * - nodeOnly：当前节点正文，不含子节点
 * - nodeWithChildren：当前节点 + 全部子孙
 * - all：整棵大纲
 * - selection：由调用方传入 selectionStats，此处忽略 tree
 */
export function analyzeScope(options: {
  scope: StatsScope;
  tree: TreeNode[];
  current: TreeNode | null;
  selectionStats?: ContentStats | null;
}): ContentStats {
  const { scope, tree, current, selectionStats } = options;
  if (scope === "selection") {
    return selectionStats ? { ...selectionStats } : { ...EMPTY_STATS };
  }
  if (scope === "all") {
    return analyzeNodes(flattenTree(tree));
  }
  if (!current) return { ...EMPTY_STATS };
  if (scope === "nodeOnly") {
    return analyzeMarkdown(current.content ?? "");
  }
  // nodeWithChildren
  return analyzeNodes(flattenNode(current));
}

// —— 内部 ——

function countCallouts(md: string): number {
  const re =
    /<aside\b[^>]*\bdata-type\s*=\s*["']callout["'][^>]*>/gi;
  return (md.match(re) ?? []).length;
}

function countMathBlocks(md: string): number {
  const block =
    /<div\b[^>]*\bdata-type\s*=\s*["']math-block["'][^>]*>/gi;
  const inline =
    /<span\b[^>]*\bdata-type\s*=\s*["']math-inline["'][^>]*>/gi;
  return (md.match(block) ?? []).length + (md.match(inline) ?? []).length;
}

/** 去掉 callout 开合标签，保留内部 */
function stripCalloutShells(md: string): string {
  return md
    .replace(/<aside\b[^>]*\bdata-type\s*=\s*["']callout["'][^>]*>/gi, "\n")
    .replace(/<\/aside>/gi, "\n");
}

/** 公式块/行内公式去掉（LaTeX 不计入普通字数） */
function stripMathBlocks(md: string): string {
  return md
    .replace(
      /<div\b[^>]*\bdata-type\s*=\s*["']math-block["'][^>]*>[\s\S]*?<\/div>/gi,
      "\n",
    )
    .replace(
      /<span\b[^>]*\bdata-type\s*=\s*["']math-inline["'][^>]*>[\s\S]*?<\/span>/gi,
      "",
    );
}

function stripFencedCode(md: string): { count: number; rest: string } {
  let count = 0;
  // ```lang\n...\n``` 或 ~~~
  const rest = md.replace(
    /^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)\s*$/gm,
    () => {
      count += 1;
      return "\n";
    },
  );
  return { count, rest };
}

function markdownToPlain(md: string): string {
  let s = md;
  // 图片 / 链接
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // 残留 HTML 标签
  s = s.replace(/<[^>]+>/g, "");
  // 标题标记、粗斜体、行内代码、引用
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/(\*\*|__)(.*?)\1/g, "$2");
  s = s.replace(/(\*|_)(.*?)\1/g, "$2");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/^>\s?/gm, "");
  s = s.replace(/^[-*+]\s+/gm, "");
  s = s.replace(/^\d+\.\s+/gm, "");
  // 常见 HTML 实体
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"');
  return s;
}

function countNonWhitespace(s: string): number {
  let n = 0;
  for (const ch of s) {
    if (!/\s/.test(ch)) n += 1;
  }
  return n;
}

/** Unicode 标点与符号；兼收常见中文标点 */
function countPunctuation(s: string): number {
  let n = 0;
  try {
    const re = /[\p{P}\p{S}]/gu;
    const m = s.match(re);
    return m?.length ?? 0;
  } catch {
    // 极老环境无 Unicode property → 回退
    for (const ch of s) {
      if (/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~，。！？；：、「」『』（）【】《》…—·]/.test(ch)) {
        n += 1;
      }
    }
    return n;
  }
}
