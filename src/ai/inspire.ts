/**
 * 灵感三种模式：完善 / 一句话 / 只框架 → ProjectData（新 id，无附件）。
 */

import {
  createId,
  normalizePriority,
  type ProjectData,
  type TreeNode,
} from "@/domain";
import { chatCompletion } from "./openaiCompat";
import { normalizeInspireTree } from "./inspireNormalize";

type RawNode = {
  title?: unknown;
  content?: unknown;
  priority?: unknown;
  children?: unknown;
};

/** 树结构约束：减少「整本挂总览 / 小节写进父正文」 */
const TREE_STRUCTURE_RULES = `Tree structure (CRITICAL):
- One outline section = one tree node. NEVER put "## 1.1 …" / "## 2.3 …" subsection headings inside a parent's content; those MUST be child nodes.
- Parent content = short intro for that node only (or empty). Details belong in children.
- Do NOT nest the whole document under a single "总览/概述/目录/Overview" root. Put 总览 (if any) as a SIBLING of major chapters; chapters 1..N are root-level siblings (parentId null / top-level tree items).
- Titles must NOT include outline numbers like "1." or "2.1" — WanGou displays numbers from tree position. Use plain titles (e.g. "产品定位与总体架构", not "1. 产品定位与总体架构").
- Prefer a balanced multi-level tree; avoid one mega-parent with dozens of mixed sections in its Markdown body.`;

const SYSTEM_JSON = `You are WanGou (万构) assistant. Reply with ONLY a JSON object, no markdown fences.
Schema:
{
  "name": string,
  "tree": [ { "title": string, "content": string (Markdown), "priority"?: "high"|"medium"|"low", "children": same[] } ]
}
Rules:
- tree must be a non-empty array
- content is Markdown for the node body
- optional priority: only "high"|"medium"|"low"; use SPARINGLY; omit for most nodes
- do not invent free-text labels
- do not include id or attachments fields
${TREE_STRUCTURE_RULES}`;

function stripFences(text: string): string {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  return s.trim();
}

function mapNode(raw: RawNode, outlineOnly: boolean): TreeNode {
  const title =
    typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim()
      : "未命名";
  let content =
    typeof raw.content === "string" ? raw.content : "";
  if (outlineOnly) {
    content = content.trim().slice(0, 80);
  }
  const priority = normalizePriority(raw.priority);
  const kids = Array.isArray(raw.children) ? raw.children : [];
  return {
    id: createId(),
    title,
    content,
    attachments: [],
    ...(priority ? { priority } : {}),
    children: kids
      .filter((c): c is RawNode => Boolean(c) && typeof c === "object")
      .map((c) => mapNode(c as RawNode, outlineOnly)),
  };
}

export function parseInspireJson(
  text: string,
  options?: { outlineOnly?: boolean },
): ProjectData {
  const outlineOnly = Boolean(options?.outlineOnly);
  const parsed = JSON.parse(stripFences(text)) as {
    name?: unknown;
    tree?: unknown;
  };
  const treeRaw = Array.isArray(parsed.tree) ? parsed.tree : [];
  if (!treeRaw.length) {
    throw new Error("Model returned empty tree");
  }
  const tree = normalizeInspireTree(
    treeRaw
      .filter((n): n is RawNode => Boolean(n) && typeof n === "object")
      .map((n) => mapNode(n, outlineOnly)),
  );
  if (!tree.length) throw new Error("Model returned invalid tree");
  const name =
    typeof parsed.name === "string" && parsed.name.trim()
      ? parsed.name.trim()
      : tree[0].title;
  return {
    name,
    tree,
    glossary: [],
    glossaryLinks: [],
    glossaryLogs: [],
  };
}

function projectToCompact(project: ProjectData): unknown {
  const pack = (n: TreeNode): unknown => ({
    title: n.title,
    content: n.content,
    ...(n.priority ? { priority: n.priority } : {}),
    ...(n.labels?.length ? { labels: n.labels } : {}),
    children: n.children.map(pack),
  });
  return {
    name: project.name,
    tree: project.tree.map(pack),
  };
}

/** 模式1：完善已有框架（树+正文） */
export async function inspireRefine(
  project: ProjectData,
): Promise<ProjectData> {
  const user = `Improve and flesh out this WanGou project (tree titles + Markdown bodies).
Keep the overall structure but deepen titles where useful and write richer Markdown content.
Optional priority (high|medium|low) sparingly; omit for most nodes; no free-text labels.
When adding detail, create child nodes instead of stuffing "## 1.1" subsections into a parent body. Keep titles unnumbered.

Input:
${JSON.stringify(projectToCompact(project), null, 2)}`;
  const raw = await chatCompletion({
    system: SYSTEM_JSON,
    user,
    temperature: 0.6,
  });
  const next = parseInspireJson(raw);
  next.name = `${project.name.trim() || next.name} · AI`;
  return next;
}

/** 模式2：一句话生成完整树+正文 */
export async function inspireFromSentence(
  sentence: string,
): Promise<ProjectData> {
  const q = sentence.trim();
  if (!q) throw new Error("Empty prompt");
  const user = `Create a complete WanGou project from this one-sentence brief.
Include a sensible multi-level tree and substantive Markdown content for each node.
Optional priority (high|medium|low) only on a few key nodes; omit for most; no free-text labels.
Follow TREE STRUCTURE rules in the system prompt: chapters as root siblings; subsections as child nodes; no numbers in titles; no ## 1.1 inside parent bodies.

Brief: ${q}`;
  const raw = await chatCompletion({
    system: SYSTEM_JSON,
    user,
    temperature: 0.75,
  });
  return parseInspireJson(raw);
}

/** 模式3：只生成框架（标题层级，正文尽量空） */
export async function inspireOutlineOnly(
  topic: string,
): Promise<ProjectData> {
  const q = topic.trim();
  if (!q) throw new Error("Empty prompt");
  const user = `Create ONLY a structural outline for a WanGou project about: ${q}
- Multi-level tree of titles
- content fields must be empty string "" (or at most a few words)
- Focus on hierarchy, not prose
- Optional priority (high|medium|low) sparingly; omit for most nodes; no free-text labels
- Chapters as root-level siblings; do not wrap everything under one 总览 node; no numbers in titles

Return JSON.`;
  const raw = await chatCompletion({
    system: SYSTEM_JSON,
    user,
    temperature: 0.5,
  });
  return parseInspireJson(raw, { outlineOnly: true });
}

/**
 * 杂乱粘贴片段 → 整理成树 + 润色正文（不杜撰关键事实）。
 * 返回的 tree 由调用方包进「粘贴导入」根并挂到当前项目。
 */
export async function inspireFromPaste(rawText: string): Promise<ProjectData> {
  const q = rawText.trim();
  if (!q) throw new Error("Empty paste");
  const clipped = q.length > 12000 ? `${q.slice(0, 12000)}\n…` : q;
  const user = `The user pasted messy notes / fragments. Organize them into a WanGou project JSON.
Rules:
- Preserve facts and key points; you may restructure hierarchy and polish wording
- Do NOT invent key data, numbers, names, or conclusions not implied by the input
- Prefer a clear multi-level tree; aim for at most ~40 nodes
- Each node: title + Markdown content; optional priority sparingly; no free-text labels
- name: a short project/import title summarizing the paste

Paste:
${clipped}`;
  const raw = await chatCompletion({
    system: SYSTEM_JSON,
    user,
    temperature: 0.55,
  });
  return parseInspireJson(raw);
}
