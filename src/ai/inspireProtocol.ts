/**
 * 灵感流式协议（NDJSON / 一行一事件）
 *
 * 设计目标：
 * - 树节点整颗出现（`node`）
 * - 正文打字机追加（`delta`）
 * - 备注块 / 代码块仍写在 Markdown content 里，靠约束 + hold-back 兼容半截流式
 *
 * 传输：Chat Completions `stream: true` 时，模型应只输出 NDJSON 行（可夹杂空行）。
 * 客户端把 SSE token 拼成文本后按行喂给 `InspireEventParser`。
 *
 * 事件顺序约定：
 * 1. 可选先发一条 `project`
 * 2. 任意条 `node`（先父后子；parentId 指向已出现的模型侧 id，根为 null）
 * 3. 对某节点可穿插多条 `delta`（按出现顺序追加到 content）
 * 4. 以 `done` 或 `error` 结束；其后事件忽略
 *
 * content 约束（写入 prompt，解析层做软校验）：
 * - Markdown；允许 HTML（备注块）
 * - 备注块可选，每节点最多 1 个：`<aside data-type="callout">…</aside>`
 * - 代码块用 fenced ``` ，可多段
 */

export type InspireEvent =
  | InspireProjectEvent
  | InspireNodeEvent
  | InspireDeltaEvent
  | InspireDoneEvent
  | InspireErrorEvent;

export type InspireProjectEvent = {
  type: "project";
  name: string;
};

/** 整节点创建；content 初始为空，靠后续 delta 填充 */
export type InspireNodeEvent = {
  type: "node";
  /** 模型侧临时 id，仅用于本轮流内父子引用 */
  id: string;
  /** null / 省略 = 根级 */
  parentId: string | null;
  title: string;
  /** 可选优先级；多数节点应省略 */
  priority?: "high" | "medium" | "low";
};

export type InspireDeltaEvent = {
  type: "delta";
  id: string;
  text: string;
};

export type InspireDoneEvent = {
  type: "done";
};

export type InspireErrorEvent = {
  type: "error";
  message: string;
};

/** 写入 system prompt 的协议说明（与上方类型保持同步） */
export const INSPIRE_STREAM_PROTOCOL_PROMPT = `You are WanGou (万构) streaming assistant.
Output ONLY NDJSON: one JSON object per line. No markdown fences. No commentary.

Event schema (exactly these types):
{"type":"project","name":string}
{"type":"node","id":string,"parentId":string|null,"title":string,"priority"?: "high"|"medium"|"low"}
{"type":"delta","id":string,"text":string}
{"type":"done"}
{"type":"error","message":string}

Rules:
- Emit "project" first (optional but preferred).
- CRITICAL playback order (parent before child; never dump all nodes first):
  For EACH node: emit one "node" line, then ALL "delta" lines for that node, THEN the next node.
  Depth-first: finish a parent's body before emitting any child node.
- "id" is a short stable token for this stream only (e.g. "n1"). "parentId" is null for roots.
- Optional "priority" on node: only "high" | "medium" | "low". Use SPARINGLY for truly important/lesser nodes; OMIT for most nodes. Do NOT invent free-text labels.
- Body text is streamed via "delta" appending to that node's Markdown content.
- Content is Markdown. HTML is allowed for callouts.
- Callout (optional, at most ONE per node): a single HTML block
  <aside data-type="callout">...</aside>
  Prefer emitting a callout as contiguous deltas that complete the whole tag quickly.
- Code blocks: fenced Markdown \`\`\` … \`\`\`; multiple code blocks per node are allowed.
- Callouts and code blocks are NOT required.
- Finish with {"type":"done"} (or {"type":"error","message":"..."} on failure).`;

export function isInspireEvent(value: unknown): value is InspireEvent {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  switch (o.type) {
    case "project":
      return typeof o.name === "string";
    case "node":
      return (
        typeof o.id === "string" &&
        o.id.length > 0 &&
        typeof o.title === "string" &&
        (o.parentId === null ||
          o.parentId === undefined ||
          typeof o.parentId === "string") &&
        (o.priority === undefined ||
          o.priority === "high" ||
          o.priority === "medium" ||
          o.priority === "low")
      );
    case "delta":
      return typeof o.id === "string" && typeof o.text === "string";
    case "done":
      return true;
    case "error":
      return typeof o.message === "string";
    default:
      return false;
  }
}

export function normalizeInspireEvent(raw: InspireEvent): InspireEvent {
  if (raw.type === "node") {
    const priority =
      raw.priority === "high" ||
      raw.priority === "medium" ||
      raw.priority === "low"
        ? raw.priority
        : undefined;
    return {
      type: "node",
      id: raw.id.trim(),
      parentId:
        raw.parentId == null || raw.parentId === ""
          ? null
          : String(raw.parentId),
      title: raw.title.trim() || "未命名",
      ...(priority ? { priority } : {}),
    };
  }
  if (raw.type === "project") {
    return { type: "project", name: raw.name.trim() };
  }
  if (raw.type === "delta") {
    return { type: "delta", id: raw.id, text: raw.text };
  }
  if (raw.type === "error") {
    return { type: "error", message: raw.message };
  }
  return { type: "done" };
}

/**
 * 从单行文本解析事件；空行 / 非 JSON / 未知 type → null（由调用方跳过）。
 * 容忍行首偶发的 "data: " 前缀。
 */
export function parseInspireEventLine(line: string): InspireEvent | null {
  let s = line.trim();
  if (!s) return null;
  if (s.startsWith("data:")) s = s.slice(5).trim();
  if (!s || s === "[DONE]") return null;
  if (s.startsWith("```")) return null;
  try {
    const raw = JSON.parse(s) as unknown;
    if (!isInspireEvent(raw)) return null;
    return normalizeInspireEvent(raw);
  } catch {
    return null;
  }
}

/** 按行缓冲的增量解析器：喂入任意 chunk，吐出完整事件 */
export class InspireEventParser {
  private buffer = "";
  private finished = false;

  get done(): boolean {
    return this.finished;
  }

  /** 推入模型文本片段，返回本轮解析出的事件 */
  push(chunk: string): InspireEvent[] {
    if (this.finished) return [];
    this.buffer += chunk;
    const out: InspireEvent[] = [];
    for (;;) {
      const nl = this.buffer.indexOf("\n");
      if (nl < 0) break;
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      const ev = parseInspireEventLine(line);
      if (!ev) continue;
      out.push(ev);
      if (ev.type === "done" || ev.type === "error") {
        this.finished = true;
        this.buffer = "";
        break;
      }
    }
    return out;
  }

  /**
   * 流结束时冲刷：若残余是完整一行 JSON 则解析；
   * 否则若尚未 done，补一条 done（宽松收尾）。
   */
  flush(): InspireEvent[] {
    if (this.finished) return [];
    const out: InspireEvent[] = [];
    const rest = this.buffer.trim();
    this.buffer = "";
    if (rest) {
      const ev = parseInspireEventLine(rest);
      if (ev) {
        out.push(ev);
        if (ev.type === "done" || ev.type === "error") {
          this.finished = true;
          return out;
        }
      }
    }
    if (!this.finished) {
      this.finished = true;
      out.push({ type: "done" });
    }
    return out;
  }
}

/**
 * 流式预览用：避免 TipTap 半截 Markdown 来回重排导致抖动。
 * - 代码块 / 备注：未闭合时补「预览用」闭合标签，壳先出、字继续打（不 held 整段）
 * - 末行列表/标题/引用：转义前缀当纯文本
 * - 行内未闭合粗体等：仍 held（晚半拍）；忽略代码块/备注内部
 * 流结束应对完整 markdown 再 set 一次。
 */
export function safePartialMarkdown(md: string): {
  visible: string;
  held: string;
} {
  let held = "";
  let visible = md;

  const takeFrom = (index: number) => {
    if (index < 0 || index >= visible.length) return;
    held = visible.slice(index) + held;
    visible = visible.slice(0, index);
  };

  // 未闭合备注：补 </aside>，黄底壳可边出边打
  {
    const calloutOpen = visible.lastIndexOf('<aside data-type="callout"');
    if (calloutOpen >= 0) {
      const after = visible.slice(calloutOpen);
      if (!/<\/aside>/i.test(after)) {
        visible = `${visible}</aside>`;
      }
    }
  }

  // 未闭合代码围栏：补闭合 ```，深色块内可持续打字
  {
    const fenceCount = (visible.match(/^```/gm) ?? []).length;
    if (fenceCount % 2 === 1) {
      visible = visible.endsWith("\n")
        ? `${visible}\`\`\``
        : `${visible}\n\`\`\``;
    }
  }

  // 末行块级标记：转义成纯文本预览，打字机可继续走
  {
    const lastNl = visible.lastIndexOf("\n");
    const lineStart = lastNl >= 0 ? lastNl + 1 : 0;
    const head = visible.slice(0, lineStart);
    const tail = visible.slice(lineStart);
    if (isUnstableBlockLine(tail)) {
      visible = head + escapeMdBlockPrefix(tail);
    }
  }

  // 行内未闭合：只看代码块/备注之外的区域，避免块内 ** 误伤
  const inlineCut = findUnclosedInlineCut(maskProtectedRegions(visible));
  if (inlineCut !== null) takeFrom(inlineCut);

  return { visible, held };
}

/** 把已闭合的代码围栏 / 备注换成等长空格，索引仍对齐原文 */
function maskProtectedRegions(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, (m) => " ".repeat(m.length))
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, (m) => " ".repeat(m.length));
}

/** 尚未换行的块级前缀：列表、标题、引用 */
function isUnstableBlockLine(line: string): boolean {
  if (!line) return false;
  return /^(#{1,6}(\s|$)|(\s*([-*+]|\d+[.)])(\s|$))|>)/.test(line);
}

/** 转义行首块级标记，让解析器当普通段落，避免半截列表/标题抖动 */
export function escapeMdBlockPrefix(line: string): string {
  return line
    .replace(/^(#{1,6})(?=\s|$)/, "\\$1")
    .replace(/^(\s*)([-*+])(?=\s|$)/, "$1\\$2")
    .replace(/^(\s*)(\d+)([.)])(?=\s|$)/, "$1$2\\$3")
    .replace(/^>/, "\\>");
}

/**
 * 找最后一个会导致「半截 → 突然成形」的行内开符位置。
 * 无则返回 null。
 */
function findUnclosedInlineCut(s: string): number | null {
  const cuts: number[] = [];

  const oddDelim = (delim: string) => {
    let i = 0;
    let count = 0;
    let last = -1;
    while (i < s.length) {
      const at = s.indexOf(delim, i);
      if (at < 0) break;
      // 跳过代码围栏行首 ```（块级已在上游处理，这里只防误伤）
      if (delim === "`" && at + 2 < s.length && s.startsWith("```", at)) {
        i = at + 3;
        continue;
      }
      count += 1;
      last = at;
      i = at + delim.length;
    }
    if (count % 2 === 1 && last >= 0) cuts.push(last);
  };

  oddDelim("**");
  oddDelim("__");
  oddDelim("`");

  // 单 * / _：跳过已计入的 ** / __
  const oddSingle = (ch: "*" | "_") => {
    const double = ch + ch;
    let i = 0;
    let count = 0;
    let last = -1;
    while (i < s.length) {
      if (s.startsWith(double, i)) {
        i += 2;
        continue;
      }
      if (s[i] === ch) {
        count += 1;
        last = i;
        i += 1;
        continue;
      }
      i += 1;
    }
    if (count % 2 === 1 && last >= 0) cuts.push(last);
  };
  oddSingle("*");
  oddSingle("_");

  // 未闭合链接 / 图片：从最后一个 [ 或 ![ 起
  const bracket = s.lastIndexOf("[");
  if (bracket >= 0) {
    const from = bracket > 0 && s[bracket - 1] === "!" ? bracket - 1 : bracket;
    const after = s.slice(from);
    const complete =
      /^!?\[[^\]]*\]\([^)]*\)$/.test(after) || /^!?\[[^\]]+\]$/.test(after);
    if (!complete) cuts.push(from);
  }

  if (!cuts.length) return null;
  return Math.min(...cuts);
}

/** 软约束：正文里 callout 多于 1 个时只保留第一个完整块 */
export function enforceSingleCallout(md: string): string {
  const re = /<aside\s+data-type="callout"[^>]*>[\s\S]*?<\/aside>/gi;
  let seen = 0;
  return md.replace(re, (block) => {
    seen += 1;
    return seen === 1 ? block : "";
  });
}

type CompactNode = {
  title?: unknown;
  content?: unknown;
  priority?: unknown;
  children?: unknown;
};

/**
 * 把旧版整包 JSON（name + tree）展开成协议事件，供降级/误返回时兼容。
 * content 按较小切片拆成多条 delta，便于 UI 仍有打字机感。
 */
export function* projectJsonToEvents(
  text: string,
  options?: { deltaChunk?: number },
): Generator<InspireEvent, void, undefined> {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  let parsed: { name?: unknown; tree?: unknown };
  try {
    parsed = JSON.parse(s) as { name?: unknown; tree?: unknown };
  } catch {
    return;
  }
  const tree = Array.isArray(parsed.tree) ? parsed.tree : [];
  if (!tree.length) return;

  const name =
    typeof parsed.name === "string" && parsed.name.trim()
      ? parsed.name.trim()
      : "";
  if (name) yield { type: "project", name };

  const chunk = Math.max(1, options?.deltaChunk ?? 48);
  let seq = 0;
  const walk = function* (
    nodes: unknown[],
    parentId: string | null,
  ): Generator<InspireEvent, void, undefined> {
    for (const raw of nodes) {
      if (!raw || typeof raw !== "object") continue;
      const n = raw as CompactNode;
      const id = `n${++seq}`;
      const title =
        typeof n.title === "string" && n.title.trim()
          ? n.title.trim()
          : "未命名";
      const priority =
        n.priority === "high" ||
        n.priority === "medium" ||
        n.priority === "low"
          ? n.priority
          : undefined;
      yield {
        type: "node",
        id,
        parentId,
        title,
        ...(priority ? { priority } : {}),
      };
      const content = typeof n.content === "string" ? n.content : "";
      for (let i = 0; i < content.length; i += chunk) {
        yield {
          type: "delta",
          id,
          text: content.slice(i, i + chunk),
        };
      }
      const kids = Array.isArray(n.children) ? n.children : [];
      yield* walk(kids, id);
    }
  };
  yield* walk(tree, null);
  yield { type: "done" };
}
