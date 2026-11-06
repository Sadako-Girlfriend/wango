/**
 * Agent 提案应用前的红绿预览（对照当前正文）。
 */

import {
  annotateContentDiff,
  coalesceDiffOps,
  diffContentBlocks,
  type DiffOp,
} from "@/editor/contentDiff";
import {
  findGlossaryById,
  findNodeById,
  type AgentMessage,
  type AgentProposal,
  type ProjectData,
} from "@/domain";
import { emptyProposalStatus } from "./agentProposals";

/** 提案对照的旧文；新建子节点返回 null（整段视为新增） */
export function resolveProposalOldText(
  project: ProjectData,
  p: AgentProposal,
): string | null {
  if (p.op === "addChild") return null;
  if (p.target === "tree") {
    const node = findNodeById(project.tree, p.nodeId);
    if (!node) return "";
    return p.field === "title" ? (node.title ?? "") : (node.content ?? "");
  }
  const entry = findGlossaryById(project.glossary, p.nodeId);
  if (!entry || entry.kind === "ref") return "";
  return p.field === "title" ? (entry.title ?? "") : (entry.content ?? "");
}

/** 提案预览用的终稿正文 */
export function resolveProposalNewText(p: AgentProposal): string {
  if (p.op === "addChild") {
    const body = (p.content ?? "").trim();
    const head = p.title.trim();
    return body ? `${head}\n\n${body}` : head;
  }
  return String(p.next ?? "");
}

/**
 * 段落级红绿 ops。
 * 新建 / 无旧文 → 整段 add；标题单行也走块 diff。
 */
export function proposalDiffOps(
  project: ProjectData,
  p: AgentProposal,
): DiffOp[] {
  const next = resolveProposalNewText(p).trim();
  const old = resolveProposalOldText(project, p);
  if (old === null) {
    return next ? [{ type: "add", text: next }] : [];
  }
  const prev = String(old).trim();
  if (!prev) {
    return next ? [{ type: "add", text: next }] : [];
  }
  if (prev === next) {
    return next ? [{ type: "equal", text: next }] : [];
  }
  return coalesceDiffOps(diffContentBlocks(prev, next));
}

/** 是否可在正文里打红绿预览（改已有 content） */
export function isBodyDiffProposal(p: AgentProposal): boolean {
  return p.op === "set" && p.field === "content";
}

/**
 * 写入编辑器的红绿 Markdown（应用前预览，不落终稿）。
 * 非正文提案或新旧相同则 null。
 */
export function annotateProposalBodyPreview(
  project: ProjectData,
  p: AgentProposal,
): string | null {
  if (!isBodyDiffProposal(p)) return null;
  const old = resolveProposalOldText(project, p);
  if (old === null) return null;
  const next = resolveProposalNewText(p);
  const annotated = annotateContentDiff(old, next);
  if (!annotated.trim()) return null;
  // 无实质增删时 annotate 直接返回新文，仍可作为预览
  return annotated;
}

/** 当前节点上第一条待确认的正文改稿提案 */
export function findPendingBodyDiffProposal(
  messages: AgentMessage[],
  focus: { scope: "tree" | "glossary"; id: string } | null,
): AgentProposal | null {
  if (!focus) return null;
  const target = focus.scope === "tree" ? "tree" : "glossary";
  for (const m of messages) {
    if (m.role !== "assistant" || !m.proposals?.length) continue;
    const status = m.proposalStatus ?? emptyProposalStatus(m.proposals);
    for (const p of m.proposals) {
      if ((status[p.id] ?? "pending") !== "pending") continue;
      if (!isBodyDiffProposal(p)) continue;
      if (p.op !== "set") continue;
      if (p.target !== target || p.nodeId !== focus.id) continue;
      return p;
    }
  }
  return null;
}

/**
 * 提案卡总结：优先用模型 note；缺失时兜底，保证卡片不空。
 * project 可选：改正文时带轻量增删段提示。
 */
export function synthesizeProposalNote(
  p: AgentProposal,
  project?: ProjectData | null,
): string {
  const fromModel = typeof p.note === "string" ? p.note.trim() : "";
  if (fromModel) return fromModel;

  if (p.op === "addChild") {
    const title = p.title.trim() || "新节点";
    return p.target === "glossary"
      ? `已写好词条「${title}」`
      : `已写好「${title}」`;
  }

  if (p.field === "title") {
    const next = String(p.next ?? "").trim() || "（空标题）";
    return `改了标题 →「${next}」`;
  }

  if (project) {
    const ops = proposalDiffOps(project, p);
    const addN = ops.filter((o) => o.type === "add").length;
    const delN = ops.filter((o) => o.type === "del").length;
    if (addN || delN) {
      const bits: string[] = [];
      if (addN) bits.push(`增 ${addN} 段`);
      if (delN) bits.push(`删 ${delN} 段`);
      return `改写了正文（${bits.join("，")}）`;
    }
  }
  return "改写了正文";
}
