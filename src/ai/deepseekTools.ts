/**
 * DeepSeek 网页 Search / Fetch（与 Chat 共用 API Key）。
 * @see https://api.deepseek.com/v1/tools/search
 */

import {
  getAppSettings,
  loadAppSettings,
  type AppSettings,
} from "@/desktop/appSettings";

export type DeepSeekSearchHit = {
  rerank_score?: number;
  title: string;
  url: string;
  snippet?: string;
  summary?: string;
  content?: string;
  site_name?: string | null;
  date?: string | null;
  authority?: number;
};

export type DeepSeekSearchResponse = {
  results?: DeepSeekSearchHit[];
};

/** 从设置里的 Base URL 推出 tools 根（…/v1） */
export function toolsApiRoot(apiBaseUrl: string): string {
  let base = apiBaseUrl.trim().replace(/\/+$/, "");
  if (!base) return "https://api.deepseek.com/v1";
  base = base.replace(/\/chat\/completions$/i, "");
  if (/\/v1$/i.test(base)) return base;
  return `${base}/v1`;
}

export async function deepseekSearch(params: {
  query: string;
  count?: number;
  needContent?: boolean;
  oriQuestion?: string;
  signal?: AbortSignal;
  settings?: AppSettings;
}): Promise<DeepSeekSearchHit[]> {
  const cfg = params.settings ?? (await loadAppSettings());
  const key = cfg.apiKey.trim();
  if (!key) throw new Error("API_NOT_CONFIGURED");
  const q = params.query.trim();
  if (!q) return [];

  const url = `${toolsApiRoot(cfg.apiBaseUrl)}/tools/search`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: q.slice(0, 128),
      count: Math.min(50, Math.max(1, params.count ?? 5)),
      need_content: params.needContent === true,
      ...(params.oriQuestion?.trim()
        ? { ori_question: params.oriQuestion.trim().slice(0, 128) }
        : {}),
    }),
    signal: params.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      text
        ? `Search ${res.status}: ${text.slice(0, 200)}`
        : `Search failed (${res.status})`,
    );
  }
  const data = (await res.json()) as DeepSeekSearchResponse;
  return Array.isArray(data.results) ? data.results : [];
}

export async function deepseekFetch(params: {
  url: string;
  signal?: AbortSignal;
  settings?: AppSettings;
}): Promise<{ title: string; content: string }> {
  const cfg = params.settings ?? (await loadAppSettings());
  const key = cfg.apiKey.trim();
  if (!key) throw new Error("API_NOT_CONFIGURED");
  const target = params.url.trim();
  if (!target) throw new Error("EMPTY_URL");

  const endpoint = `${toolsApiRoot(cfg.apiBaseUrl)}/tools/fetch`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: target.slice(0, 8192) }),
    signal: params.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      text
        ? `Fetch ${res.status}: ${text.slice(0, 200)}`
        : `Fetch failed (${res.status})`,
    );
  }
  const data = (await res.json()) as { title?: string; content?: string };
  return {
    title: typeof data.title === "string" ? data.title : "",
    content: typeof data.content === "string" ? data.content : "",
  };
}

/** 把搜索结果收成塞进 system 的短上下文 */
export function formatSearchContextForAgent(
  hits: DeepSeekSearchHit[],
  query: string,
): string {
  if (!hits.length) return "";
  const lines: string[] = [
    "======== 联网搜索结果（仅供参考，请核对后写入提案；引用时带 URL）========",
    `查询：${query.trim()}`,
    "",
  ];
  hits.forEach((h, i) => {
    const body =
      (h.summary && h.summary.trim()) ||
      (h.content && h.content.trim().slice(0, 800)) ||
      (h.snippet && h.snippet.trim()) ||
      "";
    lines.push(`${i + 1}. ${h.title || "（无标题）"}`);
    lines.push(`   URL: ${h.url}`);
    if (h.date) lines.push(`   日期: ${h.date}`);
    if (body) lines.push(`   ${body.replace(/\s+/g, " ").trim()}`);
    lines.push("");
  });
  lines.push("======== 搜索结果结束 ========");
  return lines.join("\n");
}

/**
 * Agent 发送前：若设置开启联网搜索则执行 Search。
 * 失败返回 null（调用方继续无搜索对话）。
 */
export async function maybeAgentWebSearch(params: {
  userText: string;
  signal?: AbortSignal;
}): Promise<{ context: string; hitCount: number } | null> {
  const cfg = getAppSettings();
  if (!cfg.webSearchEnabled) return null;
  if (!cfg.apiKey.trim()) return null;
  try {
    const hits = await deepseekSearch({
      query: params.userText,
      oriQuestion: params.userText,
      count: 5,
      needContent: false,
      signal: params.signal,
      settings: cfg,
    });
    if (!hits.length) return { context: "", hitCount: 0 };
    return {
      context: formatSearchContextForAgent(hits, params.userText),
      hitCount: hits.length,
    };
  } catch (err) {
    console.warn("[wango/ai] web search failed", err);
    return null;
  }
}
