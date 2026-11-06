/**
 * Agent 改稿提案：从回复中解析 fenced JSON，供用户确认后写入节点。
 */

import {
  createId,
  type AgentProposal,
  type AgentProposalAddChild,
  type AgentProposalSet,
  type AgentProposalStatus,
  type AgentProposalTarget,
} from "@/domain";

export type { AgentProposal, AgentProposalStatus };

function asTarget(v: unknown): AgentProposalTarget | null {
  return v === "tree" || v === "glossary" ? v : null;
}

function asField(v: unknown): AgentProposalSet["field"] | null {
  return v === "title" || v === "content" ? v : null;
}

function proposalId(o: Record<string, unknown>): string {
  return typeof o.id === "string" && o.id.trim() ? o.id.trim() : createId();
}

function noteOf(o: Record<string, unknown>): string | undefined {
  return typeof o.note === "string" ? o.note : undefined;
}

/**
 * 提案正文里的 ``` 围栏易再次撞车；改成 <pre> 包裹。
 * 仅处理独立成行的围栏开闭行。
 */
export function sanitizeProposalBodyFences(text: string): string {
  if (!text.includes("```")) return text;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inFence = false;
  let fenceBuf: string[] = [];
  for (const line of lines) {
    if (/^```/.test(line)) {
      if (!inFence) {
        inFence = true;
        fenceBuf = [];
        continue;
      }
      inFence = false;
      out.push("<pre>");
      out.push(...fenceBuf);
      out.push("</pre>");
      fenceBuf = [];
      continue;
    }
    if (inFence) fenceBuf.push(line);
    else out.push(line);
  }
  if (inFence) {
    // 未闭合：仍输出已收集行，避免丢内容
    out.push("<pre>");
    out.push(...fenceBuf);
    out.push("</pre>");
  }
  return out.join("\n");
}

function normalizeSet(o: Record<string, unknown>): AgentProposalSet | null {
  const target = asTarget(o.target);
  const field = asField(o.field);
  const nodeId = typeof o.nodeId === "string" ? o.nodeId.trim() : "";
  const next = typeof o.next === "string" ? o.next : null;
  if (!target || !field || !nodeId || next == null) return null;
  return {
    id: proposalId(o),
    op: "set",
    target,
    nodeId,
    field,
    next: field === "content" ? sanitizeProposalBodyFences(next) : next,
    note: noteOf(o),
  };
}

function normalizeAddChild(
  o: Record<string, unknown>,
  forcedTarget?: AgentProposalTarget,
): AgentProposalAddChild | null {
  const target = forcedTarget ?? asTarget(o.target);
  if (!target) return null;
  const title = typeof o.title === "string" ? o.title : null;
  if (title == null) return null;
  let parentId: string | null = null;
  if (typeof o.parentId === "string") {
    const trimmed = o.parentId.trim();
    parentId = !trimmed || trimmed === "null" ? null : trimmed;
  } else if (o.parentId === null || o.parentId === undefined) {
    parentId = null;
  } else {
    return null;
  }
  const content =
    typeof o.content === "string"
      ? sanitizeProposalBodyFences(o.content)
      : undefined;
  return {
    id: proposalId(o),
    op: "addChild",
    target,
    parentId,
    title,
    content,
    note: noteOf(o),
  };
}

/** 规范化单条提案；无 op 视为 set；addGlossary 归一为 addChild+glossary */
export function normalizeProposal(raw: unknown): AgentProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const opRaw = typeof o.op === "string" ? o.op.trim() : "";
  if (!opRaw || opRaw === "set") return normalizeSet(o);
  if (opRaw === "addChild") return normalizeAddChild(o);
  if (opRaw === "addGlossary") return normalizeAddChild(o, "glossary");
  return null;
}

function dedupeKey(p: AgentProposal): string {
  if (p.op === "set") return `set:${p.target}:${p.nodeId}:${p.field}`;
  // 新建可多条：按 id 保留
  return `addChild:${p.id}`;
}

/**
 * 从 start 起做括号配对，忽略字符串内的括号；成功返回 JSON 片段结束下标（不含）。
 * 正文里嵌套 ``` 时非贪婪正则会截断，必须用此法。
 */
export function sliceBalancedJson(
  text: string,
  start: number,
): string | null {
  const open = text[start];
  if (open !== "{" && open !== "[") return null;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

type FenceHit = {
  /** 整段 fence（含开闭 ```）在原文中的起止，用于从 display 删除 */
  fullStart: number;
  fullEnd: number;
  json: string;
};

/** 定位 ```wango-proposals / ```json 并用括号配对抽出 JSON */
function findProposalFences(content: string): FenceHit[] {
  const hits: FenceHit[] = [];
  const openRe = /```(?:wango-proposals|json)[^\n]*\n?/gi;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(content)) !== null) {
    const fullStart = m.index;
    const afterOpen = fullStart + m[0].length;
    const braceAt = (() => {
      for (let i = afterOpen; i < content.length; i++) {
        const c = content[i]!;
        if (c === "{" || c === "[") return i;
        if (c.trim() === "") continue;
        // 非空白且非 JSON 起点 → 跳过本 fence
        return -1;
      }
      return -1;
    })();
    if (braceAt < 0) continue;
    const json = sliceBalancedJson(content, braceAt);
    if (!json) continue;
    let fullEnd = braceAt + json.length;
    // 吃掉 JSON 后的空白与收尾 ```
    const tail = content.slice(fullEnd);
    const close = /^\s*```/.exec(tail);
    if (close) fullEnd += close[0].length;
    hits.push({ fullStart, fullEnd, json });
    // 从本 fence 结束后继续搜，避免嵌套 ``` 干扰
    openRe.lastIndex = fullEnd;
  }
  return hits;
}

function collectFromParsed(parsed: unknown, into: AgentProposal[]) {
  const list = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { proposals?: unknown }).proposals)
      ? (parsed as { proposals: unknown[] }).proposals
      : [parsed];
  for (const item of list) {
    const p = normalizeProposal(item);
    if (p) into.push(p);
  }
}

/** 从助手完整回复里抽出提案；并返回去掉 fence 后的展示正文 */
export function extractProposalsFromReply(content: string): {
  display: string;
  proposals: AgentProposal[];
} {
  const proposals: AgentProposal[] = [];
  const hits = findProposalFences(content);
  // 从后往前删，避免下标错位
  let display = content;
  for (let i = hits.length - 1; i >= 0; i--) {
    const hit = hits[i]!;
    try {
      const parsed: unknown = JSON.parse(hit.json);
      collectFromParsed(parsed, proposals);
      display =
        display.slice(0, hit.fullStart) + display.slice(hit.fullEnd);
    } catch {
      // JSON 坏了则保留原文
    }
  }
  const map = new Map<string, AgentProposal>();
  for (const p of proposals) {
    map.set(dedupeKey(p), p);
  }
  return {
    display: display.replace(/\n{3,}/g, "\n\n").trim(),
    proposals: [...map.values()],
  };
}

export function emptyProposalStatus(
  proposals: AgentProposal[],
): Record<string, AgentProposalStatus> {
  const out: Record<string, AgentProposalStatus> = {};
  for (const p of proposals) out[p.id] = "pending";
  return out;
}
