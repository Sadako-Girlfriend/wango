/**
 * 按序号把粘贴长文拆成树草稿（纯函数）。
 *
 * 边界：不读 store、不调 AI、不写磁盘；只产出 TreeNode[]（新 id）。
 * 支持：1. / 1、 / 1) / （1） / (1) 以及点分多级 1.1 / 1.1.1
 */

import { createId, createNode } from "./tree";
import type { TreeNode } from "./types";

export interface PasteSplitHit {
  /** 点分编号各段，如 [1, 1, 2] → 深度 3 */
  parts: number[];
  /** 原始编号文本，如 "1.1.2" */
  marker: string;
  /** 编号所在行去掉编号后的标题候选 */
  titleLine: string;
  /** 该节点正文（后续段落） */
  body: string;
  /** 在原文中的起始行号（0-based） */
  lineIndex: number;
}

export interface PasteSplitResult {
  /** 导入根下的子树（可能含「导语」） */
  children: TreeNode[];
  /** 命中的编号条数 */
  hitCount: number;
  /** 是否建议改走 AI（命中过少） */
  weak: boolean;
}

/** （1） / (1) */
const PAREN_RE = /^[（(]\s*(\d+)\s*[）)]\s*(.*)$/;
/** 1、 / 1)（非点分） */
const ENUM_RE = /^(\d+)\s*[、)]\s*(.*)$/;
/**
 * 点分或多级：1. / 1.1 / 1.1.1. / 1.标题
 * 编号后须跟「.」或空白，或整行恰为多级编号（如 1.1.1）。
 */
const DOTTED_RE = /^(\d+(?:\.\d+)*)(?:(\.)|\s+|$)(.*)$/;

export function parseNumberedLine(
  line: string,
): { parts: number[]; marker: string; rest: string } | null {
  const t = line.trim();
  if (!t) return null;

  const paren = PAREN_RE.exec(t);
  if (paren) {
    const n = Number(paren[1]);
    if (!Number.isFinite(n)) return null;
    return { parts: [n], marker: paren[1]!, rest: (paren[2] ?? "").trim() };
  }

  // 1、 / 1) 优先；点分多级留给 DOTTED
  const enumM = ENUM_RE.exec(t);
  if (enumM && !/^\d+\.\d/.test(t)) {
    const n = Number(enumM[1]);
    if (!Number.isFinite(n)) return null;
    return { parts: [n], marker: enumM[1]!, rest: (enumM[2] ?? "").trim() };
  }

  const dotted = DOTTED_RE.exec(t);
  if (dotted) {
    const marker = dotted[1]!;
    const hadDot = Boolean(dotted[2]);
    const rest = (dotted[3] ?? "").trim();
    const isMulti = marker.includes(".");
    // 纯数字行「42」：匹配到 $ 且无多级 → 忽略
    if (!hadDot && !isMulti && rest === "" && t === marker) return null;
    const parts = marker.split(".").map((x) => Number(x));
    if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
    return { parts, marker, rest };
  }

  return null;
}

/**
 * 将全文按编号切段。
 * 无编号的前置块 → preface；其后每个编号开启新段。
 */
export function extractNumberedHits(text: string): {
  preface: string;
  hits: PasteSplitHit[];
} {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const hits: PasteSplitHit[] = [];
  let prefaceLines: string[] = [];
  let current: PasteSplitHit | null = null;
  let seenNumber = false;

  const flush = () => {
    if (!current) return;
    current.body = current.body.replace(/^\n+/, "").replace(/\n+$/, "");
    hits.push(current);
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const parsed = parseNumberedLine(line);
    if (parsed) {
      seenNumber = true;
      flush();
      const titleLine = parsed.rest || `第 ${parsed.marker} 节`;
      current = {
        parts: parsed.parts,
        marker: parsed.marker,
        titleLine,
        body: "",
        lineIndex: i,
      };
      continue;
    }
    if (!seenNumber) {
      prefaceLines.push(line);
    } else if (current) {
      current.body += (current.body ? "\n" : "") + line;
    }
  }
  flush();

  const preface = prefaceLines.join("\n").trim();
  return { preface, hits };
}

function titleFromHit(hit: PasteSplitHit, maxLen = 40): string {
  const raw = hit.titleLine.trim() || `第 ${hit.marker} 节`;
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen)}…`;
}

function bodyFromHit(hit: PasteSplitHit): string {
  // 若标题行只是短标题，正文仅为后续；若编号后整段很长，标题截断后全文可进 content
  const title = hit.titleLine.trim();
  const rest = hit.body.trim();
  if (!rest) {
    // 仅一行：标题用截断，content 放全行（若比标题长）
    return title.length > 40 ? title : "";
  }
  return rest;
}

/**
 * 按 parts 深度把 hits 建成森林（同级列表）。
 * 跳级时挂到最近合法祖先。
 */
export function hitsToForest(hits: PasteSplitHit[]): TreeNode[] {
  type Frame = { depth: number; node: TreeNode };
  const roots: TreeNode[] = [];
  const stack: Frame[] = [];

  for (const hit of hits) {
    const depth = hit.parts.length;
    const node = createNode({
      id: createId(),
      title: titleFromHit(hit),
      content: bodyFromHit(hit),
      children: [],
    });
    while (stack.length && stack[stack.length - 1]!.depth >= depth) {
      stack.pop();
    }
    if (!stack.length) {
      roots.push(node);
    } else {
      stack[stack.length - 1]!.node.children.push(node);
    }
    stack.push({ depth, node });
  }
  return roots;
}

const WEAK_HIT_THRESHOLD = 2;

/**
 * 粘贴文本 → 导入根的子节点列表（含可选导语）。
 * rootTitle 仅供调用方包一层导入根时使用，本函数不创建导入根。
 */
export function splitPasteByNumbers(
  text: string,
  options?: { guideTitle?: string },
): PasteSplitResult {
  const raw = text ?? "";
  const { preface, hits } = extractNumberedHits(raw);
  const forest = hitsToForest(hits);
  const children: TreeNode[] = [];
  if (preface) {
    children.push(
      createNode({
        id: createId(),
        title: options?.guideTitle ?? "导语",
        content: preface,
        children: [],
      }),
    );
  }
  children.push(...forest);
  return {
    children,
    hitCount: hits.length,
    weak: hits.length < WEAK_HIT_THRESHOLD,
  };
}

/** 包一层导入根，便于挂到项目树 */
export function wrapImportRoot(
  children: TreeNode[],
  rootTitle = "粘贴导入",
): TreeNode {
  return createNode({
    id: createId(),
    title: rootTitle,
    content: "",
    children,
  });
}
