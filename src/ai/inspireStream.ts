/**
 * 灵感流式 runner：按 inspireProtocol 产出事件。
 * 网关 reasoning 以客户端事件 type:"reasoning" 抛出，供准备期遮罩展示。
 */

import type { ProjectData, TreeNode } from "@/domain";
import {
  chatCompletion,
  chatMessagesResult,
  chatMessagesStreamParts,
  type ChatStreamPart,
} from "./openaiCompat";
import {
  INSPIRE_STREAM_PROTOCOL_PROMPT,
  InspireEventParser,
  projectJsonToEvents,
  type InspireEvent,
} from "./inspireProtocol";
import { serializeInspirePlayback } from "./inspireSerial";
import { typewriterPace } from "./inspireTypewriter";

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

async function* eventsFromModelParts(
  parts: AsyncIterable<ChatStreamPart>,
): AsyncGenerator<InspireEvent, void, undefined> {
  const parser = new InspireEventParser();
  let raw = "";
  let nodeCount = 0;
  for await (const part of parts) {
    if (part.type === "reasoning") {
      if (part.text) yield { type: "reasoning", text: part.text };
      continue;
    }
    raw += part.text;
    for (const ev of parser.push(part.text)) {
      if (ev.type === "node") nodeCount += 1;
      yield ev;
      if (ev.type === "done" || ev.type === "error") return;
    }
  }
  const trailing = parser.flush();
  for (const ev of trailing) {
    if (ev.type === "node") nodeCount += 1;
    if (ev.type === "done" && nodeCount === 0) {
      const recovered = [...projectJsonToEvents(raw)];
      if (recovered.length) {
        yield* recovered;
        return;
      }
    }
    yield ev;
  }
}

/** 将完整字符串按小块假流式吐出（网关不支持 stream 时的降级） */
async function* fakeStreamParts(
  content: string,
  reasoning?: string,
  chunkSize = 24,
): AsyncGenerator<ChatStreamPart, void, undefined> {
  if (reasoning) {
    for (let i = 0; i < reasoning.length; i += chunkSize) {
      yield { type: "reasoning", text: reasoning.slice(i, i + chunkSize) };
    }
  }
  for (let i = 0; i < content.length; i += chunkSize) {
    yield { type: "content", text: content.slice(i, i + chunkSize) };
  }
}

async function* streamPartsWithFallback(params: {
  system: string;
  user: string;
  temperature?: number;
  signal?: AbortSignal;
}): AsyncGenerator<ChatStreamPart, void, undefined> {
  const messages = [
    { role: "system" as const, content: params.system },
    { role: "user" as const, content: params.user },
  ];
  try {
    yield* chatMessagesStreamParts({
      messages,
      temperature: params.temperature,
      signal: params.signal,
    });
  } catch (err) {
    if (params.signal?.aborted) throw err;
    console.warn(
      "[wango/ai] stream unavailable, falling back to non-stream (遮罩会等到整段返回)",
      err,
    );
    try {
      const full = await chatMessagesResult({
        messages,
        temperature: params.temperature,
        signal: params.signal,
      });
      yield* fakeStreamParts(full.content, full.reasoning);
    } catch {
      // 旧网关无 reasoning 字段时再退到纯正文 chatCompletion
      const full = await chatCompletion({
        system: params.system,
        user: params.user,
        temperature: params.temperature,
      });
      yield* fakeStreamParts(full);
    }
  }
}

export type InspireStreamOptions = {
  signal?: AbortSignal;
};

async function* runSerialized(
  parts: AsyncIterable<ChatStreamPart>,
  options?: InspireStreamOptions,
): AsyncGenerator<InspireEvent, void, undefined> {
  const serialized = serializeInspirePlayback(eventsFromModelParts(parts), {
    signal: options?.signal,
  });
  yield* typewriterPace(serialized, { signal: options?.signal });
}

/** 模式1：完善已有框架（树+正文） */
export async function* inspireRefineStream(
  project: ProjectData,
  options?: InspireStreamOptions,
): AsyncGenerator<InspireEvent, void, undefined> {
  const user = `Improve and flesh out this WanGou project (tree titles + Markdown bodies).
Emit NDJSON per protocol. For EACH node: emit "node", then all its "delta" lines, then the next node (parent body before any child).
Keep overall structure but deepen titles where useful.
You may set optional node "priority" (high|medium|low) SPARINGLY; omit for most nodes. Do not invent free-text labels.
Prefer name suffix in the project event (e.g. original + " · AI").
When adding detail, emit child nodes — do not put "## 1.1" subsections into a parent body; titles stay unnumbered.

Input:
${JSON.stringify(projectToCompact(project), null, 2)}`;

  yield* runSerialized(
    streamPartsWithFallback({
      system: INSPIRE_STREAM_PROTOCOL_PROMPT,
      user,
      temperature: 0.6,
      signal: options?.signal,
    }),
    options,
  );
}

/** 模式2：一句话生成完整树+正文 */
export async function* inspireFromSentenceStream(
  sentence: string,
  options?: InspireStreamOptions,
): AsyncGenerator<InspireEvent, void, undefined> {
  const q = sentence.trim();
  if (!q) {
    yield { type: "error", message: "Empty prompt" };
    return;
  }
  const user = `Create a complete WanGou project from this one-sentence brief.
Emit NDJSON per protocol. Depth-first: for EACH node emit "node" then stream its Markdown via "delta", THEN emit the next node (finish parent body before any child node).
Do NOT list all nodes before writing bodies.
Optional "priority" (high|medium|low) only on a few truly important or lesser nodes; omit for most. Do not invent free-text labels.
Follow protocol Tree structure rules: chapters as root siblings (parentId null); subsections as child nodes; no "## 1.1" inside parent bodies; no numbers in titles.

Brief: ${q}`;

  yield* runSerialized(
    streamPartsWithFallback({
      system: INSPIRE_STREAM_PROTOCOL_PROMPT,
      user,
      temperature: 0.75,
      signal: options?.signal,
    }),
    options,
  );
}

/** 模式3：只生成框架（标题层级，尽量无 delta） */
export async function* inspireOutlineOnlyStream(
  topic: string,
  options?: InspireStreamOptions,
): AsyncGenerator<InspireEvent, void, undefined> {
  const q = topic.trim();
  if (!q) {
    yield { type: "error", message: "Empty prompt" };
    return;
  }
  const user = `Create ONLY a structural outline for a WanGou project about: ${q}
- Emit "node" events depth-first (parent before child)
- Do NOT emit delta (empty bodies)
- Focus on hierarchy, not prose
- Optional "priority" (high|medium|low) only where it clearly helps; omit for most nodes; no free-text labels
- Chapters as root siblings; do not wrap everything under one 总览; titles without outline numbers
- End with done`;

  yield* runSerialized(
    streamPartsWithFallback({
      system: INSPIRE_STREAM_PROTOCOL_PROMPT,
      user,
      temperature: 0.5,
      signal: options?.signal,
    }),
    options,
  );
}

/** 杂乱粘贴 → 流式整理进树（调用方挂到导入根下） */
export async function* inspireFromPasteStream(
  rawText: string,
  options?: InspireStreamOptions,
): AsyncGenerator<InspireEvent, void, undefined> {
  const q = rawText.trim();
  if (!q) {
    yield { type: "error", message: "Empty paste" };
    return;
  }
  const clipped = q.length > 12000 ? `${q.slice(0, 12000)}\n…` : q;
  const user = `The user pasted messy notes / fragments. Organize into a WanGou outline via NDJSON protocol.
Rules:
- Preserve facts and key points; restructure and polish wording OK
- Do NOT invent key data, numbers, names, or conclusions absent from the paste
- Prefer ≤ ~40 nodes; depth-first: for EACH node emit "node" then stream Markdown via "delta", then next node
- Optional priority sparingly; no free-text labels
- Emit a short "project" name summarizing the paste; end with done

Paste:
${clipped}`;

  yield* runSerialized(
    streamPartsWithFallback({
      system: INSPIRE_STREAM_PROTOCOL_PROMPT,
      user,
      temperature: 0.55,
      signal: options?.signal,
    }),
    options,
  );
}
