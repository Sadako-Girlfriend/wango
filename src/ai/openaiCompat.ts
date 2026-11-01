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

/**
 * OpenAI 兼容流式输出：产出 content delta 字符串。
 * 不支持 stream / 非 SSE 时抛错，由上层决定是否降级 chatCompletion。
 */
export async function* chatCompletionStream(params: {
  system: string;
  user: string;
  temperature?: number;
  signal?: AbortSignal;
}): AsyncGenerator<string, void, undefined> {
  const cfg = await loadAppSettings();
  if (!isApiConfigured(cfg)) {
    throw new Error("API_NOT_CONFIGURED");
  }
  const model = cfg.model.trim() || "gpt-4o-mini";
  const url = chatUrl(cfg.apiBaseUrl.trim());
  console.info("[wango/ai] chatCompletionStream", {
    model,
    url,
    settingsModel: cfg.model.trim() || "(empty → gpt-4o-mini)",
  });
  let res: Response;
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
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
      }),
      signal: params.signal,
    });
  } catch (err) {
    throw networkErrorMessage(err, url);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[wango/ai] stream failed", res.status, text.slice(0, 200));
    throw new Error(
      text
        ? `API ${res.status}: ${text.slice(0, 240)}`
        : `API request failed (${res.status})`,
    );
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
            choices?: { delta?: { content?: string } }[];
          };
          const piece = json.choices?.[0]?.delta?.content;
          if (piece) yield piece;
        } catch {
          // 跳过残缺 SSE 行
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
