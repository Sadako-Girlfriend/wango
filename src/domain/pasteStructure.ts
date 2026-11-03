/**
 * 粘贴/导入：按结构拆成树（序号优先，否则标题；可选 HTML 标题）。
 * 纯函数，不改写正文。
 */

import {
  extractNumberedHits,
  hitsToForest,
  splitPasteByNumbers,
  wrapImportRoot,
  type PasteSplitResult,
} from "./pasteSplit";
import { createId, createNode } from "./tree";
import type { TreeNode } from "./types";

export type StructureKind = "numbers" | "titles" | "html" | "none";

export interface StructureSplitResult extends PasteSplitResult {
  kind: StructureKind;
}

/** 常见「键：值」正文起手，不当标题 */
const FIELD_PREFIX_RE =
  /^(核心|诉求|状态|备注|说明|背景|目标|范围|定义|注意|摘要|概述|内容)[:：]/;
/** 正文口吻短行，不当标题 */
const BODYISH_PREFIX_RE =
  /^(说明|简介|介绍|补充|例如|比如|首先|其次|另外|此外|因此|所以)/;

const TITLE_MAX = 24;

/** 短行启发式：像不像标题（不靠空行） */
export function isLikelyTitleLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.length > TITLE_MAX) return false;
  if (/[。？！?！；;]$/.test(t)) return false;
  if (FIELD_PREFIX_RE.test(t)) return false;
  if (BODYISH_PREFIX_RE.test(t)) return false;
  // 整行「键：很长的值」
  if (/^[^:：]{1,12}[:：].{8,}/.test(t)) return false;
  // 纯数字 / 序号行交给序号解析
  if (/^\d+([.、).）]|\s|$)/.test(t)) return false;
  return true;
}

/** 标题需后跟至少一行「非标题」正文，避免把连续短正文都切成节点 */
export function isConfirmedTitleLine(
  lines: string[],
  index: number,
): boolean {
  if (!isLikelyTitleLine(lines[index] ?? "")) return false;
  for (let j = index + 1; j < lines.length; j++) {
    const n = (lines[j] ?? "").trim();
    if (!n) continue;
    return !isLikelyTitleLine(n);
  }
  // 文末单独短行：仅当前面已有其它确认标题时才当标题（由调用方处理）；此处允许
  return true;
}

export function extractTitleHits(text: string): {
  preface: string;
  hits: Array<{ title: string; body: string }>;
} {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const hits: Array<{ title: string; body: string }> = [];
  let prefaceLines: string[] = [];
  let current: { title: string; bodyLines: string[] } | null = null;
  let seenTitle = false;

  const flush = () => {
    if (!current) return;
    hits.push({
      title: current.title,
      body: current.bodyLines.join("\n").replace(/^\n+/, "").replace(/\n+$/, ""),
    });
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (isConfirmedTitleLine(lines, i)) {
      seenTitle = true;
      flush();
      current = { title: line.trim(), bodyLines: [] };
      continue;
    }
    if (!seenTitle) prefaceLines.push(line);
    else if (current) current.bodyLines.push(line);
  }
  flush();

  return { preface: prefaceLines.join("\n").trim(), hits };
}

export function splitPasteByTitles(
  text: string,
  options?: { guideTitle?: string },
): PasteSplitResult {
  const { preface, hits } = extractTitleHits(text ?? "");
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
  for (const h of hits) {
    children.push(
      createNode({
        id: createId(),
        title: h.title.slice(0, 40),
        content: h.body,
        children: [],
      }),
    );
  }
  return {
    children,
    hitCount: hits.length,
    weak: hits.length < 2,
  };
}

/** HTML 粘贴块：level 1–6 为标题；0 为正文 */
export interface HtmlPasteBlock {
  level: number;
  text: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    );
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 从 Word/浏览器 HTML 抽出标题层级块 */
export function extractBlocksFromHtml(html: string): HtmlPasteBlock[] {
  const raw = html ?? "";
  if (!raw.trim()) return [];
  const blocks: HtmlPasteBlock[] = [];
  // 按块级标签粗切
  const re =
    /<(h[1-6]|p|div)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const tag = m[1]!.toLowerCase();
    const attrs = m[2] ?? "";
    const inner = stripTags(m[3] ?? "");
    if (!inner) continue;
    let level = 0;
    const hm = /^h([1-6])$/.exec(tag);
    if (hm) level = Number(hm[1]);
    else {
      const style = attrs.match(/mso-outline-level\s*:\s*(\d+)/i);
      if (style) level = Math.min(6, Math.max(1, Number(style[1])));
      const cls = attrs.match(/class\s*=\s*["']([^"']*)["']/i);
      if (cls) {
        const c = cls[1]!;
        const hClass = /(?:^|\s)(?:Mso)?Heading\s*([1-6])/i.exec(c);
        if (hClass) level = Number(hClass[1]);
        else if (/Title/i.test(c) && !/Subtitle/i.test(c)) level = 1;
      }
    }
    blocks.push({ level, text: inner.replace(/\s*\n\s*/g, "\n").trim() });
  }
  return blocks;
}

export function blocksToForest(blocks: HtmlPasteBlock[]): {
  children: TreeNode[];
  hitCount: number;
} {
  type Frame = { depth: number; node: TreeNode };
  const roots: TreeNode[] = [];
  const stack: Frame[] = [];
  let hitCount = 0;
  let pendingBody: string[] = [];

  const flushBody = () => {
    if (!pendingBody.length) return;
    const text = pendingBody.join("\n\n").trim();
    pendingBody = [];
    if (!text) return;
    if (stack.length) {
      const n = stack[stack.length - 1]!.node;
      n.content = n.content ? `${n.content}\n\n${text}` : text;
    } else {
      roots.push(
        createNode({
          id: createId(),
          title: "导语",
          content: text,
          children: [],
        }),
      );
    }
  };

  for (const b of blocks) {
    if (b.level <= 0) {
      pendingBody.push(b.text);
      continue;
    }
    flushBody();
    hitCount += 1;
    const depth = b.level;
    const node = createNode({
      id: createId(),
      title: b.text.slice(0, 40) || "未命名",
      content: "",
      children: [],
    });
    while (stack.length && stack[stack.length - 1]!.depth >= depth) {
      stack.pop();
    }
    if (!stack.length) roots.push(node);
    else stack[stack.length - 1]!.node.children.push(node);
    stack.push({ depth, node });
  }
  flushBody();
  return { children: roots, hitCount };
}

export function splitPasteFromHtml(
  html: string,
  options?: { guideTitle?: string },
): StructureSplitResult {
  const blocks = extractBlocksFromHtml(html);
  const headingCount = blocks.filter((b) => b.level > 0).length;
  if (headingCount < 1) {
    return {
      children: [],
      hitCount: 0,
      weak: true,
      kind: "none",
    };
  }
  const { children, hitCount } = blocksToForest(blocks);
  // 导语标题可本地化
  if (options?.guideTitle) {
    for (const c of children) {
      if (c.title === "导语") c.title = options.guideTitle;
    }
  }
  return {
    children,
    hitCount,
    weak: hitCount < 2,
    kind: "html",
  };
}

const NUMBER_PREF_THRESHOLD = 2;

/**
 * 结构拆分：HTML 标题 > 足够序号 > 短行标题。
 */
export function splitPasteByStructure(
  input: { text: string; html?: string | null },
  options?: { guideTitle?: string },
): StructureSplitResult {
  const html = input.html?.trim();
  if (html) {
    const fromHtml = splitPasteFromHtml(html, options);
    if (!fromHtml.weak && fromHtml.hitCount >= NUMBER_PREF_THRESHOLD) {
      return fromHtml;
    }
    // HTML 弱命中时仍可与纯文本策略比较
    if (fromHtml.hitCount >= 1 && fromHtml.children.length) {
      // 若纯文本序号更强则用序号
      const byNum = splitPasteByNumbers(input.text, options);
      if (byNum.hitCount >= NUMBER_PREF_THRESHOLD && !byNum.weak) {
        return { ...byNum, kind: "numbers" };
      }
      return fromHtml;
    }
  }

  const byNum = splitPasteByNumbers(input.text, options);
  if (byNum.hitCount >= NUMBER_PREF_THRESHOLD) {
    return { ...byNum, kind: "numbers" };
  }

  const byTitle = splitPasteByTitles(input.text, options);
  if (byTitle.hitCount >= 1) {
    return {
      ...byTitle,
      kind: "titles",
      weak: byTitle.hitCount < NUMBER_PREF_THRESHOLD,
    };
  }

  // 序号仅 1 条也可用
  if (byNum.hitCount >= 1) {
    return { ...byNum, kind: "numbers", weak: true };
  }

  return {
    children: byNum.children.length ? byNum.children : byTitle.children,
    hitCount: 0,
    weak: true,
    kind: "none",
  };
}

export { wrapImportRoot, extractNumberedHits, hitsToForest };
