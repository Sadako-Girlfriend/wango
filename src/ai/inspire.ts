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

type RawNode = {
  title?: unknown;
  content?: unknown;
  priority?: unknown;
  children?: unknown;
};

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
- do not include id or attachments fields`;

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
  const tree = treeRaw
    .filter((n): n is RawNode => Boolean(n) && typeof n === "object")
    .map((n) => mapNode(n, outlineOnly));
  if (!tree.length) throw new Error("Model returned invalid tree");
  const name =
    typeof parsed.name === "string" && parsed.name.trim()
      ? parsed.name.trim()
      : tree[0].title;
  return { name, tree };
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
Return the full improved project JSON.

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

Return JSON.`;
  const raw = await chatCompletion({
    system: SYSTEM_JSON,
    user,
    temperature: 0.5,
  });
  return parseInspireJson(raw, { outlineOnly: true });
}
