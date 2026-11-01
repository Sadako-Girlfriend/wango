/**
 * 把 delta 再切成小片并加间隔，做出打字机观感。
 * 模型/网关常按 token 大段吐字，直接上屏会像「一段一段」。
 */

import type { InspireEvent } from "./inspireProtocol";

export type TypewriterPaceOptions = {
  signal?: AbortSignal;
  /** 每拍吐出的码点数，默认 1 */
  charsPerTick?: number;
  /** 每拍间隔 ms，默认 18 */
  intervalMs?: number;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function* typewriterPace(
  source: AsyncIterable<InspireEvent>,
  options?: TypewriterPaceOptions,
): AsyncGenerator<InspireEvent, void, undefined> {
  const charsPerTick = Math.max(1, options?.charsPerTick ?? 1);
  const intervalMs = Math.max(0, options?.intervalMs ?? 18);
  const signal = options?.signal;

  for await (const ev of source) {
    if (signal?.aborted) return;
    if (ev.type !== "delta" || !ev.text) {
      yield ev;
      continue;
    }
    const chars = Array.from(ev.text);
    for (let i = 0; i < chars.length; i += charsPerTick) {
      if (signal?.aborted) return;
      yield {
        type: "delta",
        id: ev.id,
        text: chars.slice(i, i + charsPerTick).join(""),
      };
      if (intervalMs > 0 && i + charsPerTick < chars.length) {
        try {
          await sleep(intervalMs, signal);
        } catch {
          return;
        }
      }
    }
  }
}
