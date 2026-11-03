/**
 * 词表链接来源 / 锚点对齐（纯函数）。
 */

import type { GlossaryLink, GlossaryLinkSource } from "../types";
import { createId } from "../tree";

export function linkSourceOf(link: Pick<GlossaryLink, "source">): GlossaryLinkSource {
  return link.source === "manual" ? "manual" : "auto";
}

export function isManualLink(link: Pick<GlossaryLink, "source">): boolean {
  return linkSourceOf(link) === "manual";
}

export function isAutoLink(link: Pick<GlossaryLink, "source">): boolean {
  return linkSourceOf(link) === "auto";
}

/** 是否应在正文画高亮：仅手动且仍有效/改动待审 */
export function shouldHighlightLink(link: GlossaryLink): boolean {
  return (
    isManualLink(link) &&
    (link.status === "active" || link.status === "modified")
  );
}

export function findNthOccurrence(
  haystack: string,
  needle: string,
  n: number,
): { start: number; end: number } | null {
  if (!needle || n < 0) return null;
  let from = 0;
  for (let i = 0; i <= n; i++) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) return null;
    if (i === n) return { start: idx, end: idx + needle.length };
    from = idx + 1;
  }
  return null;
}

/** plain/markdown 中，位置 before 之前 needle 出现了几次（0-based 下一次索引） */
export function occurrenceIndexBefore(
  haystack: string,
  needle: string,
  before: number,
): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0 || idx >= before) break;
    count += 1;
    from = idx + 1;
  }
  return count;
}

function allOccurrences(haystack: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) break;
    out.push(idx);
    from = idx + 1;
  }
  return out;
}

/** 统一不可见空白，避免选区与存盘 Markdown 差一个 NBSP 就挂不上 */
export function normalizeAnchorText(s: string): string {
  return s.replace(/\u00a0/g, " ").replace(/[\u200b\u200c\u200d\ufeff]/g, "");
}

/** 可夹在锚文字之间的 Markdown / 换行（编辑器纯文本常不含块间换行） */
function skipNoise(md: string, i: number, want: string): number {
  const c = md[i];
  if (!c) return 0;
  if (want === c) return 0;
  if (c === "*" || c === "_" || c === "~" || c === "`") return 1;
  if (c === "\r" || c === "\n") return 1;
  const atLineStart = i === 0 || md[i - 1] === "\n";
  // 行首标题 / 引用 / 无序、有序列表标记
  if (atLineStart) {
    if (c === "#") {
      let n = 1;
      while (md[i + n] === "#") n += 1;
      if (md[i + n] === " " || md[i + n] === "\t") return n + 1;
    }
    if (c === ">" && (md[i + 1] === " " || md[i + 1] === "\t")) return 2;
    if (
      (c === "-" || c === "+" || c === "*") &&
      (md[i + 1] === " " || md[i + 1] === "\t")
    ) {
      return 2;
    }
    if (c >= "0" && c <= "9") {
      let n = 1;
      while (md[i + n] >= "0" && md[i + n] <= "9") n += 1;
      if (md[i + n] === "." && (md[i + n + 1] === " " || md[i + n + 1] === "\t")) {
        return n + 2;
      }
    }
  }
  return 0;
}

/**
 * 在 Markdown 中按「纯文字序列」匹配 needle：允许中间夹加粗标记/换行。
 * 解决编辑器选区来自 doc.textContent，而存盘是 Markdown 的错位。
 */
export function findLooseInMarkdown(
  markdown: string,
  needle: string,
  from = 0,
): { start: number; end: number } | null {
  if (!needle || from >= markdown.length) return null;
  const first = needle[0];
  for (let i = from; i < markdown.length; i++) {
    if (markdown[i] !== first) continue;
    let mi = i;
    let ni = 0;
    while (ni < needle.length && mi < markdown.length) {
      if (markdown[mi] === needle[ni]) {
        mi += 1;
        ni += 1;
        continue;
      }
      const skip = skipNoise(markdown, mi, needle[ni]);
      if (skip > 0) {
        mi += skip;
        continue;
      }
      break;
    }
    if (ni === needle.length) return { start: i, end: mi };
  }
  return null;
}

function allLooseOccurrences(
  markdown: string,
  needle: string,
): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  if (!needle) return out;
  let from = 0;
  while (from < markdown.length) {
    const hit = findLooseInMarkdown(markdown, needle, from);
    if (!hit) break;
    out.push(hit);
    from = hit.start + 1;
  }
  return out;
}

/**
 * 定位手动绑锚：先精确，再按纯文字宽松匹配；occurrenceIndex 为编辑器纯文本计次。
 */
export function locateAnchorInHost(
  hostContent: string,
  anchor: string,
  occurrenceIndex: number,
): { start: number; end: number } | null {
  const needle = normalizeAnchorText(anchor).trim();
  if (!needle) return null;
  const host = normalizeAnchorText(hostContent);

  const exact =
    findNthOccurrence(host, needle, occurrenceIndex) ??
    findNthOccurrence(host, needle, 0);
  if (exact) {
    // 归一化未改长度时偏移可直接用；改了则回退到原文宽松匹配
    if (host.length === hostContent.length) return exact;
  }

  const loose = allLooseOccurrences(hostContent, needle);
  if (!loose.length) {
    // 再试：归一化 needle 对原文宽松（host 已被 NBSP 等改写时）
    return (
      allLooseOccurrences(host, needle)[occurrenceIndex] ??
      allLooseOccurrences(host, needle)[0] ??
      null
    );
  }
  if (occurrenceIndex >= 0 && occurrenceIndex < loose.length) {
    return loose[occurrenceIndex];
  }
  return loose[0];
}

/**
 * 按锚文字在宿主正文中重对齐手动链。
 * - 找到 → active（若先前仅因丢锚而 modified 则恢复）
 * - 找不到 → modified + reason
 * - removed/revoked 保持不动
 */
export function realignManualLink(
  link: GlossaryLink,
  hostContent: string,
  at = new Date().toISOString(),
): GlossaryLink {
  if (!isManualLink(link)) return link;
  if (link.status === "removed" || link.status === "revoked") return link;

  const anchor = (link.anchorText || link.matchedText || "").trim()
    ? link.anchorText || link.matchedText
    : "";
  if (!anchor) {
    return {
      ...link,
      status: "modified",
      reason: "锚点为空",
      updatedAt: at,
    };
  }

  const exactHits = allOccurrences(hostContent, anchor);
  const looseHits =
    exactHits.length > 0 ? [] : allLooseOccurrences(hostContent, anchor);
  const hits = exactHits.length
    ? exactHits.map((start) => ({ start, end: start + anchor.length }))
    : looseHits;

  if (!hits.length) {
    return {
      ...link,
      status: "modified",
      reason: "锚点丢失",
      matchedText: anchor,
      anchorText: anchor,
      updatedAt: at,
    };
  }

  const best = hits.reduce((a, b) =>
    Math.abs(a.start - link.start) <= Math.abs(b.start - link.start) ? a : b,
  );
  const nextStatus =
    link.status === "modified" && link.reason === "锚点丢失"
      ? "active"
      : link.status === "modified"
        ? "modified"
        : "active";

  return {
    ...link,
    start: best.start,
    end: best.end,
    matchedText: anchor,
    anchorText: anchor,
    status: nextStatus,
    reason: nextStatus === "active" ? undefined : link.reason,
    updatedAt: at,
  };
}

export function createManualLink(input: {
  entryId: string;
  hostNodeId: string;
  start: number;
  end: number;
  text: string;
  /** 编辑器纯文本中的出现次序；装饰对齐同名多处 */
  occurrenceIndex?: number;
}): GlossaryLink {
  const text = input.text;
  const at = new Date().toISOString();
  return {
    id: createId(),
    entryId: input.entryId,
    hostNodeId: input.hostNodeId,
    start: input.start,
    end: input.end,
    matchedText: text,
    originText: text,
    anchorText: text,
    occurrenceIndex:
      input.occurrenceIndex != null && input.occurrenceIndex >= 0
        ? input.occurrenceIndex
        : undefined,
    source: "manual",
    status: "active",
    updatedAt: at,
  };
}
