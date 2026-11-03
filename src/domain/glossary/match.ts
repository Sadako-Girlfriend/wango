/**
 * 词条最长匹配 + 黑名单 + 链接 reconcile（纯函数）。
 *
 * 边界（禁止耦合）：
 * - 输入/输出只有字符串与 Glossary* 类型；不读 store、不碰编辑器。
 * - 偏移相对「节点 content 原文字符串」；渲染层自行映射到 ProseMirror。
 * - 不修改正文：只产出 GlossaryLink / GlossaryLog，由调用方写回 ProjectData。
 */

import type {
  GlossaryLink,
  GlossaryLinkStatus,
  GlossaryLog,
  GlossaryNode,
  TreeNode,
} from "../types";
import { createId } from "../tree";
import {
  isManualLink,
  realignManualLink,
} from "./linkSource";
import { resolveGlossaryTitle } from "./tree";

export interface GlossaryTerm {
  entryId: string;
  text: string;
  blacklist: string[];
}

export interface MatchHit {
  entryId: string;
  start: number;
  end: number;
  matchedText: string;
  status: Extract<GlossaryLinkStatus, "active" | "blocked">;
  reason?: string;
}

/** 展开词表 title+aliases 为扫链词条（长词优先） */
export function collectTerms(
  glossary: GlossaryNode[],
  tree: TreeNode[],
): GlossaryTerm[] {
  const terms: GlossaryTerm[] = [];
  const walk = (list: GlossaryNode[]) => {
    for (const n of list) {
      const title = resolveGlossaryTitle(n, tree).trim();
      const texts = new Set<string>();
      if (title) texts.add(title);
      for (const a of n.aliases) {
        const t = a.trim();
        if (t) texts.add(t);
      }
      for (const text of texts) {
        terms.push({
          entryId: n.id,
          text,
          blacklist: n.blacklist.map((b) => b.trim()).filter(Boolean),
        });
      }
      walk(n.children);
    }
  };
  walk(glossary);
  terms.sort((a, b) => b.text.length - a.text.length || a.text.localeCompare(b.text));
  return terms;
}

function overlaps(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

/** 语境窗口：匹配前后若干字符，用于黑名单判断 */
function contextAround(text: string, start: number, end: number, pad = 8): string {
  return text.slice(Math.max(0, start - pad), Math.min(text.length, end + pad));
}

/**
 * 贪心最长匹配；区间不重叠。
 * 若匹配落在该词条黑名单短语内 → blocked（仍记录，不占区间给更短词）。
 */
export function matchLongest(text: string, terms: GlossaryTerm[]): MatchHit[] {
  if (!text || !terms.length) return [];
  const occupied: Array<{ start: number; end: number }> = [];
  const hits: MatchHit[] = [];

  for (const term of terms) {
    if (!term.text) continue;
    let from = 0;
    while (from <= text.length - term.text.length) {
      const idx = text.indexOf(term.text, from);
      if (idx < 0) break;
      const start = idx;
      const end = idx + term.text.length;
      from = idx + 1;

      if (occupied.some((o) => overlaps(start, end, o.start, o.end))) {
        continue;
      }

      const ctx = contextAround(text, start, end);
      const blockedBy = term.blacklist.find((b) => b && ctx.includes(b));
      if (blockedBy) {
        hits.push({
          entryId: term.entryId,
          start,
          end,
          matchedText: term.text,
          status: "blocked",
          reason: `blacklist:${blockedBy}`,
        });
        // 黑名单拦截仍占用区间，避免短词再链
        occupied.push({ start, end });
        continue;
      }

      hits.push({
        entryId: term.entryId,
        start,
        end,
        matchedText: term.text,
        status: "active",
      });
      occupied.push({ start, end });
    }
  }

  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  return hits;
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface ReconcileResult {
  links: GlossaryLink[];
  logs: GlossaryLog[];
}

/**
 * 从正文抽出含匹配区间的原句（供审计卡片展示）。
 * 优先按 。！？换行 扩句；过长则退回前后 pad 窗口。
 */
export function snippetAround(
  text: string,
  start: number,
  end: number,
  pad = 28,
): string {
  if (!text) return "";
  const s = Math.max(0, Math.min(start, text.length));
  const e = Math.max(s, Math.min(end, text.length));
  const isSep = (ch: string) =>
    ch === "。" ||
    ch === "！" ||
    ch === "？" ||
    ch === "\n" ||
    ch === "！" ||
    ch === "?" ||
    ch === "!";

  let lo = s;
  while (lo > 0 && !isSep(text[lo - 1]!)) lo--;
  let hi = e;
  while (hi < text.length && !isSep(text[hi]!)) hi++;
  if (hi < text.length && isSep(text[hi]!)) hi += 1;

  if (hi - lo > 140) {
    lo = Math.max(0, s - pad);
    hi = Math.min(text.length, e + pad);
  }

  return text
    .slice(lo, hi)
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 将某 host 节点的新匹配与旧 links 合并。
 * - 手动 removed / revoked 的同区间尽量保留人工状态
 * - 短词被长词挤掉 → yielded
 * - 新建/状态变化日志写入 before=原句片段，供日志面板展示（不是 message）
 */
export function reconcileHostLinks(
  prevLinks: GlossaryLink[],
  hostNodeId: string,
  hits: MatchHit[],
  entryIds: Set<string>,
  hostContent = "",
): ReconcileResult {
  const others = prevLinks.filter((l) => l.hostNodeId !== hostNodeId);
  const prevHost = prevLinks.filter((l) => l.hostNodeId === hostNodeId);
  const logs: GlossaryLog[] = [];
  const nextHost: GlossaryLink[] = [];
  const usedPrev = new Set<string>();
  const at = nowIso();

  const sentence = (start: number, end: number) =>
    snippetAround(hostContent, start, end);

  // 人工移除/撤销：若区间文本仍在且用户未改词，保留状态（不自动复活，除非命中且无 removed）
  const manualKeep = prevHost.filter(
    (l) =>
      (l.status === "removed" || l.status === "revoked") &&
      entryIds.has(l.entryId),
  );

  for (const hit of hits) {
    const manual = manualKeep.find(
      (l) =>
        l.entryId === hit.entryId &&
        l.start === hit.start &&
        l.end === hit.end &&
        l.matchedText === hit.matchedText,
    );
    if (manual && hit.status === "active") {
      // 仍被手动移除：保持 removed，不建 active
      nextHost.push({ ...manual, updatedAt: at });
      usedPrev.add(manual.id);
      continue;
    }

    const prev = prevHost.find(
      (l) =>
        !usedPrev.has(l.id) &&
        l.entryId === hit.entryId &&
        l.start === hit.start &&
        l.end === hit.end,
    );

    if (prev) {
      usedPrev.add(prev.id);
      const status = hit.status;
      if (prev.status !== status) {
        logs.push({
          id: createId(),
          entryId: hit.entryId,
          kind: "ref",
          status,
          hostNodeId,
          before: sentence(hit.start, hit.end),
          message:
            status === "blocked"
              ? tBlocked(hit.reason)
              : status === "active"
                ? "自动引用"
                : status,
          at,
          linkId: prev.id,
        });
      }
      nextHost.push({
        ...prev,
        matchedText: hit.matchedText,
        // 出生名只写一次；同步改名只改 matchedText
        originText: prev.originText || prev.matchedText || hit.matchedText,
        source: prev.source ?? "auto",
        status,
        reason: hit.reason,
        updatedAt: at,
      });
    } else {
      const link: GlossaryLink = {
        id: createId(),
        entryId: hit.entryId,
        hostNodeId,
        start: hit.start,
        end: hit.end,
        matchedText: hit.matchedText,
        originText: hit.matchedText,
        source: "auto",
        status: hit.status,
        reason: hit.reason,
        updatedAt: at,
      };
      nextHost.push(link);
      logs.push({
        id: createId(),
        entryId: hit.entryId,
        kind: "ref",
        status: hit.status,
        hostNodeId,
        before: sentence(hit.start, hit.end),
        message:
          hit.status === "blocked"
            ? tBlocked(hit.reason)
            : "自动引用",
        at,
        linkId: link.id,
      });
    }
  }

  // 旧 active 未再命中：可能是让位或消失
  for (const old of prevHost) {
    if (usedPrev.has(old.id)) continue;
    if (old.status === "removed" || old.status === "revoked") {
      nextHost.push(old);
      continue;
    }
    if (old.status === "active" || old.status === "blocked") {
      const covered = hits.some(
        (h) =>
          h.entryId !== old.entryId &&
          overlaps(old.start, old.end, h.start, h.end),
      );
      const status: GlossaryLinkStatus = covered ? "yielded" : "removed";
      const link: GlossaryLink = {
        ...old,
        status,
        reason: covered ? "因区间冲突自动让位" : old.reason,
        updatedAt: at,
      };
      nextHost.push(link);
      logs.push({
        id: createId(),
        entryId: old.entryId,
        kind: "ref",
        status,
        hostNodeId,
        before: sentence(old.start, old.end),
        message: covered ? "因区间冲突自动让位" : "引用失效",
        at,
        linkId: old.id,
      });
    } else {
      nextHost.push(old);
    }
  }

  return { links: [...others, ...nextHost], logs };
}

function tBlocked(reason?: string): string {
  if (reason?.startsWith("blacklist:")) {
    return "触发词条专属黑名单自动移除";
  }
  return "自动拦截";
}

function hostContentMap(
  tree: TreeNode[],
  glossary: GlossaryNode[],
): Map<string, string> {
  const map = new Map<string, string>();
  const walkT = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      map.set(n.id, n.content);
      walkT(n.children);
    }
  };
  const walkG = (nodes: GlossaryNode[]) => {
    for (const n of nodes) {
      if (n.kind !== "ref") map.set(n.id, n.content);
      walkG(n.children);
    }
  };
  walkT(tree);
  walkG(glossary);
  return map;
}

function overlapsRange(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): boolean {
  return a0 < b1 && b0 < a1;
}

/** 遍历大纲全部节点 content 做扫链；手动链单独重对齐后合并 */
export function scanProjectLinks(
  tree: TreeNode[],
  glossary: GlossaryNode[],
  prevLinks: GlossaryLink[],
): ReconcileResult {
  const terms = collectTerms(glossary, tree);
  const entryIds = new Set(terms.map((t) => t.entryId));
  const kept = prevLinks.filter((l) => entryIds.has(l.entryId));
  const manuals = kept.filter((l) => isManualLink(l));
  const autos = kept.filter((l) => !isManualLink(l));
  const allLogs: GlossaryLog[] = [];
  const contents = hostContentMap(tree, glossary);
  const at = new Date().toISOString();

  // 手动链：按锚文字重对齐（不参与自动 reconcile 覆盖）
  const alignedManuals = manuals.map((l) => {
    const content = contents.get(l.hostNodeId);
    if (content == null) {
      return {
        ...l,
        status:
          l.status === "removed" || l.status === "revoked"
            ? l.status
            : ("modified" as const),
        reason: content == null ? "宿主丢失" : l.reason,
        updatedAt: at,
      };
    }
    const next = realignManualLink(l, content, at);
    if (
      next.status !== l.status ||
      next.start !== l.start ||
      next.end !== l.end ||
      next.reason !== l.reason
    ) {
      if (next.status === "modified" && next.reason === "锚点丢失") {
        allLogs.push({
          id: createId(),
          entryId: next.entryId,
          kind: "ref",
          status: "modified",
          hostNodeId: next.hostNodeId,
          before: next.anchorText || next.matchedText,
          message: "手动引用锚点丢失",
          at,
          linkId: next.id,
        });
      }
    }
    return next;
  });

  let links = autos;

  const filterHitsAgainstManual = (
    hostId: string,
    hits: MatchHit[],
  ): MatchHit[] =>
    hits.filter((hit) => {
      // 已有手动链盖住同文案同区间 → 不再建自动疑似（含绑到别的词条）
      return !alignedManuals.some(
        (m) =>
          m.hostNodeId === hostId &&
          (m.status === "active" || m.status === "modified") &&
          (m.anchorText || m.matchedText) === hit.matchedText &&
          overlapsRange(m.start, m.end, hit.start, hit.end),
      );
    });

  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      const hits = filterHitsAgainstManual(
        n.id,
        matchLongest(n.content, terms),
      );
      const r = reconcileHostLinks(links, n.id, hits, entryIds, n.content);
      links = r.links;
      allLogs.push(...r.logs);
      walk(n.children);
    }
  };
  walk(tree);

  const walkG = (nodes: GlossaryNode[]) => {
    for (const n of nodes) {
      if (n.kind !== "ref") {
        const hits = filterHitsAgainstManual(
          n.id,
          matchLongest(
            n.content,
            terms.filter((t) => t.entryId !== n.id),
          ),
        );
        const r = reconcileHostLinks(
          links,
          n.id,
          hits,
          entryIds,
          n.content,
        );
        links = r.links;
        allLogs.push(...r.logs);
      }
      walkG(n.children);
    }
  };
  walkG(glossary);

  // 合并：自动结果 + 手动（手动优先保留）
  const autoOnly = links.filter((l) => !isManualLink(l));
  return { links: [...autoOnly, ...alignedManuals], logs: allLogs };
}

/** 统计某词条有效引用数 */
export function countActiveLinks(
  links: GlossaryLink[],
  entryId: string,
): number {
  return links.filter((l) => l.entryId === entryId && l.status === "active")
    .length;
}

/** 在 Markdown 字符串上按区间替换（从后往前，避免偏移错位） */
export function replaceRanges(
  text: string,
  ranges: Array<{ start: number; end: number; next: string }>,
): string {
  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  let out = text;
  for (const r of sorted) {
    if (r.start < 0 || r.end > out.length || r.start > r.end) continue;
    out = out.slice(0, r.start) + r.next + out.slice(r.end);
  }
  return out;
}
