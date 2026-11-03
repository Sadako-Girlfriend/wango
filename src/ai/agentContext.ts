/**
 * Agent 全量上下文：整棵大纲正文 + 词表（小项目默认全喂）。
 */

import {
  resolveGlossaryContent,
  resolveGlossaryTitle,
  type GlossaryNode,
  type ProjectData,
  type TreeNode,
} from "@/domain";

const MAX_PACK_CHARS = 200_000;

function walkTree(
  nodes: TreeNode[],
  lines: string[],
  prefix: string,
): void {
  nodes.forEach((n, i) => {
    const path = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
    const title = n.title.trim() || "（未命名）";
    lines.push(`### [${path}] ${title}`);
    lines.push(`id: ${n.id}`);
    lines.push("正文:");
    lines.push(n.content?.trim() ? n.content : "（空）");
    lines.push("");
    if (n.children.length) walkTree(n.children, lines, path);
  });
}

function walkGlossary(
  nodes: GlossaryNode[],
  tree: TreeNode[],
  lines: string[],
  depth = 0,
): void {
  for (const n of nodes) {
    const pad = "  ".repeat(depth);
    const title = resolveGlossaryTitle(n, tree).trim() || "（未命名词条）";
    const body = resolveGlossaryContent(n, tree).trim() || "（空）";
    lines.push(`${pad}### ${title}`);
    lines.push(`${pad}id: ${n.id}`);
    lines.push(`${pad}kind: ${n.kind}`);
    if (n.aliases?.length) {
      lines.push(`${pad}别名: ${n.aliases.join("、")}`);
    }
    lines.push(`${pad}正文:`);
    lines.push(body);
    lines.push("");
    if (n.children.length) walkGlossary(n.children, tree, lines, depth + 1);
  }
}

/** 打包整份项目供 Agent 阅读 */
export function buildFullProjectPack(
  project: ProjectData,
  focus?: { scope: "tree" | "glossary"; id: string; title: string } | null,
): string {
  const lines: string[] = [];
  lines.push(`# 项目：${project.name.trim() || "未命名"}`);
  if (focus) {
    lines.push(
      `# 当前编辑焦点：${focus.scope === "tree" ? "大纲节点" : "词条"}「${focus.title}」(id=${focus.id})`,
    );
  } else {
    lines.push("# 当前编辑焦点：无");
  }
  lines.push("");
  lines.push("# 大纲树（含全部正文）");
  lines.push("");
  walkTree(project.tree, lines, "");
  lines.push("# 词表库（含全部正文）");
  lines.push("");
  if (!project.glossary.length) {
    lines.push("（空）");
  } else {
    walkGlossary(project.glossary, project.tree, lines);
  }

  let text = lines.join("\n");
  if (text.length > MAX_PACK_CHARS) {
    text =
      text.slice(0, MAX_PACK_CHARS) +
      `\n\n…（项目过长，已截断至约 ${MAX_PACK_CHARS} 字；请优先依据未截断部分与用户说明。）`;
  }
  return text;
}
