/**
 * 标题旁魔法棒：改写当前节点全文，或仅改选区 / 代码块 / 备注。
 * 上下文：全树标题大纲 + 当前节点全文；有选区时再标出选中段。
 */

import type { NumberedTreeNode } from "@/domain";
import { normalizeMathInMarkdown } from "./mathMarkdown";
import { chatCompletion } from "./openaiCompat";

export type WandBlockKind = "text" | "code" | "callout";

/** 扁平编号标题大纲；currentId 对应行加 ← current */
export function formatTreeTitleOutline(
  nodes: NumberedTreeNode[],
  currentId?: string | null,
): string {
  const lines: string[] = [];
  const walk = (list: NumberedTreeNode[]) => {
    for (const n of list) {
      const title = n.title.trim() || "（无标题）";
      const mark = n.id === currentId ? "  ← current" : "";
      lines.push(`${n.number} ${title}${mark}`);
      if (n.children.length) walk(n.children);
    }
  };
  walk(nodes);
  return lines.join("\n") || "（空树）";
}

export async function wandRewrite(params: {
  idea: string;
  title: string;
  numberLabel?: string | null;
  /** 全树标题大纲（仅标题，无其它节点正文） */
  treeOutline: string;
  /** node = 整节点正文；selection = 局部 */
  scope: "node" | "selection";
  current: string;
  /** 当前节点全文（选区时作正文上下文；整节点时与 current 相同） */
  nodeBody?: string;
  block?: WandBlockKind;
  language?: string | null;
}): Promise<string> {
  const idea = params.idea.trim();
  if (!idea) throw new Error("EMPTY_IDEA");

  const outlineBlock = `Project outline (titles only; "← current" marks this node):
${params.treeOutline.trim() || "（空树）"}`;

  const nodeLabel = params.numberLabel
    ? `${params.numberLabel} ${params.title || "（无标题）"}`
    : params.title || "（无标题）";

  if (params.scope === "node") {
    const system = `You are WanGou (万构) writing assistant.
Rewrite the body of ONE outline node according to the user's idea.
You receive the full project title outline for orientation — do NOT rewrite other nodes.
Return ONLY the new Markdown body for the current node. No title line, no JSON, no code fences wrapping the whole reply.
Keep useful structure (headings, lists, callouts, code blocks, math) when appropriate.
Math formulas: use
  <div data-type="math-block" data-latex="LaTeX">LaTeX</div>
  or <span data-type="math-inline" data-latex="LaTeX">LaTeX</span>
  (or $...$ / $$...$$).
Language: match the user's idea / existing content (usually Chinese).`;
    const user = `${outlineBlock}

Current node: ${nodeLabel}

User idea:
${idea}

Current node body Markdown:
${params.current.trim() || "（空）"}

Rewrite ONLY this node's body. Output Markdown only.`;
    return normalizeMathInMarkdown(
      stripOuterFence(await chatCompletion({ system, user, temperature: 0.7 })),
    );
  }

  const block = params.block ?? "text";
  const bodyBlock = formatNodeBodyContext(
    nodeLabel,
    params.nodeBody ?? params.current,
    params.current,
    true,
  );

  if (block === "code") {
    const lang = params.language?.trim() || "plain";
    const system = `You are a coding assistant inside WanGou.
Rewrite ONLY the selected code according to the user's idea.
Use the project outline and current node body only as context.
Return ONLY the replacement code text. No markdown fences, no explanation.`;
    const user = `Language: ${lang}

${outlineBlock}

User idea:
${idea}

${bodyBlock}

Selected code to replace:
${params.current}

Output the replacement code only.`;
    return stripOuterFence(
      await chatCompletion({ system, user, temperature: 0.3 }),
      lang,
    );
  }

  if (block === "callout") {
    const system = `You are WanGou assistant.
Rewrite ONLY the selected callout/note content according to the user's idea.
Use the project outline and current node body only as context. Do not rewrite the rest of the node.
Return Markdown suitable inside a note block. No wrapping fences for the whole reply.`;
    const user = `${outlineBlock}

User idea:
${idea}

${bodyBlock}

Selected note content to replace:
${params.current.trim() || "（空）"}

Output the replacement Markdown only.`;
    return normalizeMathInMarkdown(
      stripOuterFence(await chatCompletion({ system, user, temperature: 0.7 })),
    );
  }

  const system = `You are WanGou writing assistant.
Rewrite ONLY the selected fragment according to the user's idea.
Use the project outline and current node body only as context (tone, topic, position in the doc).
Do not rewrite or repeat the unselected parts.
Return Markdown for that fragment only (not the whole document). No wrapping fences for the whole reply.`;
  const user = `${outlineBlock}

User idea:
${idea}

${bodyBlock}

Selected fragment to replace:
${params.current.trim() || "（空）"}

Output the replacement Markdown only.`;
  return normalizeMathInMarkdown(
    stripOuterFence(await chatCompletion({ system, user, temperature: 0.7 })),
  );
}

function formatNodeBodyContext(
  nodeLabel: string,
  nodeBody: string,
  selected: string,
  markSelection: boolean,
): string {
  const body = (nodeBody ?? "").trim();
  const sel = selected.trim();
  let marked = body;
  if (markSelection && body && sel) {
    const idx = body.indexOf(sel);
    if (idx >= 0) {
      marked =
        body.slice(0, idx) +
        "⟦SELECTED_START⟧" +
        body.slice(idx, idx + sel.length) +
        "⟦SELECTED_END⟧" +
        body.slice(idx + sel.length);
    }
  }
  return `Current node: ${nodeLabel}

Current node body (context; markers ⟦SELECTED_START⟧…⟦SELECTED_END⟧ show the target if found):
${marked || "（空）"}`;
}

function stripOuterFence(text: string, preferLang?: string): string {
  let s = text.trim();
  const fence = /^```(?:([\w+-]+))?\s*\n?([\s\S]*?)\n?```$/;
  const m = fence.exec(s);
  if (m) {
    const lang = (m[1] || "").toLowerCase();
    const body = m[2] ?? "";
    if (!preferLang || !lang || lang === preferLang.toLowerCase() || lang === "text") {
      return body.trimEnd();
    }
  }
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:[\w+-]+)?\s*/i, "").replace(/\s*```$/i, "");
  }
  return s.trim();
}
