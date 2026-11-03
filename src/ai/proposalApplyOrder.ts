/**
 * 批量应用提案时的顺序：先建父再写子，同节点标题先于正文。
 * 同批 addChild 的 id 可作为后续提案的 parentId / nodeId（临时引用）。
 */

import type { AgentProposal } from "@/domain";

/** 解析依赖：返回必须先于 `p` 应用的提案 id */
function prerequisiteIds(
  p: AgentProposal,
  byId: Map<string, AgentProposal>,
): string[] {
  const out: string[] = [];
  if (p.op === "addChild" && p.parentId && byId.has(p.parentId)) {
    out.push(p.parentId);
  }
  if (p.op === "set" && byId.has(p.nodeId)) {
    const anchor = byId.get(p.nodeId)!;
    if (anchor.op === "addChild") out.push(p.nodeId);
  }
  if (p.op === "set" && p.field === "content") {
    for (const other of byId.values()) {
      if (
        other.op === "set" &&
        other.field === "title" &&
        other.target === p.target &&
        other.nodeId === p.nodeId
      ) {
        out.push(other.id);
      }
    }
  }
  return out;
}

/**
 * 拓扑排序；有环或不连通时按原相对顺序补齐剩余项。
 */
export function orderProposalsForApply(
  proposals: AgentProposal[],
): AgentProposal[] {
  if (proposals.length <= 1) return [...proposals];
  const byId = new Map(proposals.map((p) => [p.id, p]));
  const indeg = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const p of proposals) {
    indeg.set(p.id, 0);
    children.set(p.id, []);
  }
  for (const p of proposals) {
    const uniq = [...new Set(prerequisiteIds(p, byId))];
    for (const pre of uniq) {
      if (!byId.has(pre) || pre === p.id) continue;
      children.get(pre)!.push(p.id);
      indeg.set(p.id, (indeg.get(p.id) ?? 0) + 1);
    }
  }

  const ready = proposals
    .filter((p) => (indeg.get(p.id) ?? 0) === 0)
    .map((p) => p.id);
  const orderedIds: string[] = [];
  const seen = new Set<string>();

  while (ready.length) {
    // 稳定：同层保持输入顺序
    ready.sort(
      (a, b) =>
        proposals.findIndex((p) => p.id === a) -
        proposals.findIndex((p) => p.id === b),
    );
    const id = ready.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    orderedIds.push(id);
    for (const next of children.get(id) ?? []) {
      const n = (indeg.get(next) ?? 1) - 1;
      indeg.set(next, n);
      if (n === 0) ready.push(next);
    }
  }

  for (const p of proposals) {
    if (!seen.has(p.id)) orderedIds.push(p.id);
  }
  return orderedIds.map((id) => byId.get(id)!);
}

/** 把临时提案 id 换成已创建的真实节点 id */
export function remapProposalIds(
  p: AgentProposal,
  idMap: ReadonlyMap<string, string>,
): AgentProposal {
  if (p.op === "addChild") {
    if (p.parentId && idMap.has(p.parentId)) {
      return { ...p, parentId: idMap.get(p.parentId)! };
    }
    return p;
  }
  if (idMap.has(p.nodeId)) {
    return { ...p, nodeId: idMap.get(p.nodeId)! };
  }
  return p;
}
