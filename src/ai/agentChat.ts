/**
 * Agent 对话：全量项目上下文 + 多轮；改稿用提案 JSON，不直接落盘。
 * 流式区分思考（reasoning）与正文。
 */

import type { ProjectData } from "@/domain";
import { buildFullProjectPack } from "./agentContext";
import {
  chatMessagesResult,
  chatMessagesStreamParts,
  type ChatMessage,
  type ChatStreamPart,
} from "./openaiCompat";

export type { ChatStreamPart };

export function buildAgentSystemPrompt(ctx: {
  project: ProjectData;
  focus?: { scope: "tree" | "glossary"; id: string; title: string } | null;
}): string {
  const pack = buildFullProjectPack(ctx.project, ctx.focus ?? null);
  return [
    "你是「万构」写作助手 Agent。用户在编辑结构化大纲（节点树 + 词表），不是改电脑文件。",
    "下面提供了当前项目的**全部**大纲正文与词表，请据此连贯理解设定；不要编造未出现的情节或人设。",
    "用简洁中文回答。普通问答直接说即可。",
    "",
    "若用户要求改结构或改稿，除简短说明外，必须在回复末尾追加一个提案代码块（可多条），格式严格如下：",
    "```wango-proposals",
    JSON.stringify({
      proposals: [
        {
          id: "p1",
          op: "set",
          target: "tree",
          nodeId: "……",
          field: "content",
          next: "改写后的全文（Markdown）",
          note: "可选说明",
        },
        {
          id: "p2",
          op: "addChild",
          target: "tree",
          parentId: "已有父节点id",
          title: "大节点",
          content: "可选正文",
        },
        {
          id: "p3",
          op: "addChild",
          target: "tree",
          parentId: "p2",
          title: "挂在大节点下的子节点",
          content: "可选正文",
        },
        {
          id: "p4",
          op: "addChild",
          target: "glossary",
          parentId: null,
          title: "新词条",
          content: "可选释义",
        },
      ],
    }),
    "```",
    "规则：",
    "- op：set（改已有）或 addChild（新建子节点）。也可用 op:\"addGlossary\" 表示新建词条（等同 addChild + target glossary）。",
    "- target：tree（大纲）或 glossary（词条）。",
    "- set：nodeId 必须来自上下文；field 只能是 title 或 content；next 为完整新内容（改 content 给全文，不要只给片段补丁）。",
    "- addChild：parentId 为父节点 id；树侧必须给出有效父 id；词表 parentId 可为 null 表示挂到词表根。title 必填，content 可选。",
    "- 同批新建层级：子节点的 parentId 可填父提案的 id（如上例 p3.parentId=\"p2\"）；一键应用会先建父再建模子。对新建节点再 set 时，nodeId 也可填该提案 id。",
    "- content / next 使用 Markdown。代码块用标准 ``` fence。备注块（callout）写成：",
    '  <aside data-type="callout"><p>备注内容</p></aside>',
    "- 词条引用由用户「应用」提案后由软件自动扫链；不要编造 link id 或字符偏移。",
    "- 不要改用户没要求的节点；不确定就先问，不要输出提案。",
    "- 用户确认前系统不会写入；提案仅供界面「应用」或「全部应用」。",
    "",
    "======== 项目全文开始 ========",
    pack,
    "======== 项目全文结束 ========",
  ].join("\n");
}

export async function* runAgentReply(params: {
  system: string;
  history: { role: "user" | "assistant"; content: string }[];
  signal?: AbortSignal;
}): AsyncGenerator<ChatStreamPart, void, undefined> {
  const messages: ChatMessage[] = [
    { role: "system", content: params.system },
    ...params.history
      .filter((m) => m.content.trim())
      .map((m) => ({ role: m.role, content: m.content })),
  ];
  try {
    yield* chatMessagesStreamParts({
      messages,
      temperature: 0.7,
      signal: params.signal,
    });
  } catch (err) {
    if (params.signal?.aborted) throw err;
    const r = await chatMessagesResult({
      messages,
      temperature: 0.7,
      signal: params.signal,
    });
    if (r.reasoning) yield { type: "reasoning", text: r.reasoning };
    yield { type: "content", text: r.content };
  }
}
