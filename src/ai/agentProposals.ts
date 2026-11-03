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

const FENCE_RE =
  /```(?:wango-proposals|json)\s*([\s\S]*?)```/gi;

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
    next,
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
    typeof o.content === "string" ? o.content : undefined;
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

/** 从助手完整回复里抽出提案；并返回去掉 fence 后的展示正文 */
export function extractProposalsFromReply(content: string): {
  display: string;
  proposals: AgentProposal[];
} {
  const proposals: AgentProposal[] = [];
  let display = content;
  const matches = [...content.matchAll(FENCE_RE)];
  for (const m of matches) {
    const body = (m[1] ?? "").trim();
    if (!body) continue;
    try {
      const parsed: unknown = JSON.parse(body);
      const list = Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === "object" &&
            Array.isArray((parsed as { proposals?: unknown }).proposals)
          ? (parsed as { proposals: unknown[] }).proposals
          : [parsed];
      for (const item of list) {
        const p = normalizeProposal(item);
        if (p) proposals.push(p);
      }
      display = display.replace(m[0], "").trim();
    } catch {
      // 非 JSON fence 保留在正文
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
