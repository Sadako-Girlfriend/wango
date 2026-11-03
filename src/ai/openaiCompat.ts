/**
 * OpenAI 兼容 Chat Completions（本机 settings 中的 Base URL / Key / 模型）。
 */

import {
  getAppSettings,
  loadAppSettings,
  type AppSettings,
} from "@/desktop/appSettings";

export function isApiConfigured(s?: AppSettings): boolean {
  const cfg = s ?? getAppSettings();
  return Boolean(cfg.apiBaseUrl.trim() && cfg.apiKey.trim());
}

export async function ensureApiSettings(): Promise<AppSettings> {
  return loadAppSettings();
}

function chatUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  if (base.endsWith("/v1")) return `${base}/chat/completions`;
  return `${base}/chat/completions`;
}

function networkErrorMessage(err: unknown, url: string): Error {
  const raw = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
    return new Error(
      `无法连接 API（${url}）。请检查：Base URL 是否正确、本机网络/代理、以及是否被防火墙拦截。原始错误：${raw}`,
    );
  }
  return err instanceof Error ? err : new Error(raw);
}

export async function chatCompletion(params: {
  system: string;
  user: string;
  temperature?: number;
}): Promise<string> {
  const cfg = await loadAppSettings();
  if (!isApiConfigured(cfg)) {
    throw new Error("API_NOT_CONFIGURED");
  }
  const model = cfg.model.trim() || "gpt-4o-mini";
  const url = chatUrl(cfg.apiBaseUrl.trim());
  console.info("[wango/ai] chatCompletion", {
    model,
    url,
    settingsModel: cfg.model.trim() || "(empty → gpt-4o-mini)",
  });
  const messages = [
    { role: "system", content: params.system },
    { role: "user", content: params.user },
  ];
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  const bodyBase = {
    model,
    temperature: params.temperature ?? 0.7,
    messages,
  };

  try {
    // 部分兼容网关不支持 response_format，失败则降级重试
    let res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...bodyBase,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyBase),
      });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        text
          ? `API ${res.status}: ${text.slice(0, 240)}`
          : `API request failed (${res.status})`,
      );
    }
    const data = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
    };
    if (data.model) {
      console.info("[wango/ai] chatCompletion response.model", data.model);
    }
    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("Empty model response");
    }
    return content;
  } catch (err) {
    throw networkErrorMessage(err, url);
  }
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatStreamPart = {
  type: "reasoning" | "content";
  text: string;
};

function buildChatBody(params: {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  stream: boolean;
}): Record<string, unknown> {
  // DeepSeek 等：打开 thinking；不支持的网关一般会忽略未知字段
  return {
    model: params.model,
    temperature: params.temperature ?? 0.7,
    stream: params.stream,
    messages: params.messages,
    thinking: { type: "enabled" },
  };
}

/**
 * 流式：区分 reasoning_content（思考）与 content（正文）。
 */
export async function* chatMessagesStreamParts(params: {
  messages: ChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
}): AsyncGenerator<ChatStreamPart, void, undefined> {
  const cfg = await loadAppSettings();
  if (!isApiConfigured(cfg)) {
    throw new Error("API_NOT_CONFIGURED");
  }
  const model = cfg.model.trim() || "gpt-4o-mini";
  const url = chatUrl(cfg.apiBaseUrl.trim());
  console.info("[wango/ai] chatMessagesStreamParts", {
    model,
    url,
    n: params.messages.length,
  });
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(
        buildChatBody({
          model,
          messages: params.messages,
          temperature: params.temperature,
          stream: true,
        }),
      ),
      signal: params.signal,
    });
  } catch (err) {
    throw networkErrorMessage(err, url);
  }
  if (!res.ok) {
    // 部分网关拒收 thinking 字段：去掉后重试一次
    const text = await res.text().catch(() => "");
    console.warn("[wango/ai] stream failed", res.status, text.slice(0, 200));
    if (res.status === 400 || res.status === 422) {
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: params.temperature ?? 0.7,
            stream: true,
            messages: params.messages,
          }),
          signal: params.signal,
        });
      } catch (err) {
        throw networkErrorMessage(err, url);
      }
    }
    if (!res.ok) {
      const again = await res.text().catch(() => text);
      throw new Error(
        again
          ? `API ${res.status}: ${again.slice(0, 240)}`
          : `API request failed (${res.status})`,
      );
    }
  }
  if (!res.body) {
    throw new Error("Streaming body unavailable");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const rawLine of parts) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload) as {
            choices?: {
              delta?: {
                content?: string | null;
                reasoning_content?: string | null;
                reasoning?: string | null;
              };
            }[];
          };
          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;
          const reasoning =
            delta.reasoning_content ?? delta.reasoning ?? null;
          if (typeof reasoning === "string" && reasoning) {
            yield { type: "reasoning", text: reasoning };
          }
          if (typeof delta.content === "string" && delta.content) {
            yield { type: "content", text: delta.content };
          }
        } catch {
          // 跳过残缺 SSE 行
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** 仅正文 delta（灵感等旧调用方） */
export async function* chatMessagesStream(params: {
  messages: ChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
}): AsyncGenerator<string, void, undefined> {
  for await (const part of chatMessagesStreamParts(params)) {
    if (part.type === "content") yield part.text;
  }
}

/** 多轮非流式（含可选思考） */
export async function chatMessagesResult(params: {
  messages: ChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
}): Promise<{ content: string; reasoning?: string }> {
  const cfg = await loadAppSettings();
  if (!isApiConfigured(cfg)) {
    throw new Error("API_NOT_CONFIGURED");
  }
  const model = cfg.model.trim() || "gpt-4o-mini";
  const url = chatUrl(cfg.apiBaseUrl.trim());
  const post = async (withThinking: boolean) => {
    const body = withThinking
      ? buildChatBody({
          model,
          messages: params.messages,
          temperature: params.temperature,
          stream: false,
        })
      : {
          model,
          temperature: params.temperature ?? 0.7,
          messages: params.messages,
        };
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: params.signal,
    });
  };
  let res: Response;
  try {
    res = await post(true);
    if (res.status === 400 || res.status === 422) {
      res = await post(false);
    }
  } catch (err) {
    throw networkErrorMessage(err, url);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      text
        ? `API ${res.status}: ${text.slice(0, 240)}`
        : `API request failed (${res.status})`,
    );
  }
  const data = (await res.json()) as {
    choices?: {
      message?: {
        content?: string;
        reasoning_content?: string;
        reasoning?: string;
      };
    }[];
  };
  const msg = data.choices?.[0]?.message;
  const content = msg?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Empty model response");
  }
  const reasoning = msg?.reasoning_content ?? msg?.reasoning;
  return {
    content,
    reasoning:
      typeof reasoning === "string" && reasoning.trim()
        ? reasoning
        : undefined,
  };
}

/** 多轮非流式（流失败时可降级） */
export async function chatMessages(params: {
  messages: ChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const r = await chatMessagesResult(params);
  return r.content;
}

export async function* chatCompletionStream(params: {
  system: string;
  user: string;
  temperature?: number;
  signal?: AbortSignal;
}): AsyncGenerator<string, void, undefined> {
  yield* chatMessagesStream({
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
    temperature: params.temperature,
    signal: params.signal,
  });
}
