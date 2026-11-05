/**
 * 串行播放：未轮到的 node 不往外抛；先父后子；
 * 当前节点选中并流完正文后，才抛出下一个 node。
 */

import type {
  InspireDeltaEvent,
  InspireErrorEvent,
  InspireEvent,
  InspireNodeEvent,
  InspireProjectEvent,
  InspireReasoningEvent,
} from "./inspireProtocol";

type NodeRec = {
  id: string;
  parentId: string | null;
  title: string;
};

export type SerializeInspireOptions = {
  signal?: AbortSignal;
  /** 当前节点正文静默多久后，若下一节点已排队且本节点已有过 delta，则切下一节点 */
  idleMs?: number;
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

/**
 * 把可能乱序的模型事件重排为 UI 播放序：
 * project → (node → 其 delta*)* → done|error
 */
export async function* serializeInspirePlayback(
  source: AsyncIterable<InspireEvent>,
  options?: SerializeInspireOptions,
): AsyncGenerator<InspireEvent, void, undefined> {
  const idleMs = options?.idleMs ?? 72;
  const signal = options?.signal;

  const order: NodeRec[] = [];
  const known = new Set<string>();
  const played = new Set<string>();
  const deltaQ = new Map<string, string[]>();

  let pendingProject: InspireProjectEvent | null = null;
  const reasoningQ: string[] = [];
  let sourceEnded = false;
  let errorEv: InspireErrorEvent | null = null;

  const waiters: Array<() => void> = [];
  const notify = () => {
    while (waiters.length) waiters.shift()?.();
  };
  const waitTick = () =>
    new Promise<void>((resolve) => {
      waiters.push(resolve);
    });

  const pushDelta = (id: string, text: string) => {
    const q = deltaQ.get(id);
    if (q) q.push(text);
    else deltaQ.set(id, [text]);
  };

  const ingest = (ev: InspireEvent) => {
    switch (ev.type) {
      case "project":
        pendingProject = ev;
        break;
      case "reasoning":
        if (ev.text) reasoningQ.push(ev.text);
        break;
      case "node": {
        if (known.has(ev.id)) break;
        // 父尚未出现则仍入队，nextPlayable 会等父 played
        known.add(ev.id);
        order.push({
          id: ev.id,
          parentId: ev.parentId,
          title: ev.title,
        });
        break;
      }
      case "delta":
        if (ev.text) pushDelta(ev.id, ev.text);
        break;
      case "error":
        errorEv = ev;
        sourceEnded = true;
        break;
      case "done":
        sourceEnded = true;
        break;
      default:
        break;
    }
    notify();
  };

  const producer = (async () => {
    try {
      for await (const ev of source) {
        if (signal?.aborted) break;
        ingest(ev);
        if (ev.type === "done" || ev.type === "error") break;
      }
    } catch (err) {
      if (signal?.aborted) return;
      const message =
        err instanceof Error ? err.message : "Inspire stream failed";
      ingest({ type: "error", message });
      return;
    } finally {
      sourceEnded = true;
      notify();
    }
  })();

  const nextPlayable = (): NodeRec | null => {
    for (const n of order) {
      if (played.has(n.id)) continue;
      if (n.parentId != null) {
        if (!known.has(n.parentId)) continue;
        if (!played.has(n.parentId)) continue;
      }
      return n;
    }
    return null;
  };

  const hasBufferedDelta = (id: string) => (deltaQ.get(id)?.length ?? 0) > 0;

  const laterHasDelta = (currentId: string) =>
    order.some(
      (n) => n.id !== currentId && !played.has(n.id) && hasBufferedDelta(n.id),
    );

  const hasNextQueued = (currentId: string) => {
    const idx = order.findIndex((n) => n.id === currentId);
    if (idx < 0) return false;
    return order.slice(idx + 1).some((n) => !played.has(n.id));
  };

  try {
    while (!signal?.aborted) {
      // 思考过程优先抛出，准备期 UI 可立刻滚动
      if (reasoningQ.length) {
        const text = reasoningQ.shift()!;
        const r: InspireReasoningEvent = { type: "reasoning", text };
        yield r;
        continue;
      }

      if (pendingProject) {
        const p = pendingProject;
        pendingProject = null;
        yield p;
        continue;
      }

      if (errorEv && played.size === 0 && order.length === 0) {
        yield errorEv;
        return;
      }

      const n = nextPlayable();
      if (!n) {
        if (sourceEnded) {
          if (errorEv) yield errorEv;
          else yield { type: "done" };
          return;
        }
        await waitTick();
        continue;
      }

      const nodeEv: InspireNodeEvent = {
        type: "node",
        id: n.id,
        parentId: n.parentId,
        title: n.title,
      };
      yield nodeEv;

      let hadDelta = false;
      let closed = false;
      while (!closed && !signal?.aborted) {
        if (reasoningQ.length) {
          const text = reasoningQ.shift()!;
          yield { type: "reasoning", text } satisfies InspireReasoningEvent;
          continue;
        }
        const q = deltaQ.get(n.id);
        if (q?.length) {
          hadDelta = true;
          const text = q.shift()!;
          const delta: InspireDeltaEvent = { type: "delta", id: n.id, text };
          yield delta;
          continue;
        }

        if (laterHasDelta(n.id) || sourceEnded) {
          closed = true;
          break;
        }

        if (hadDelta && hasNextQueued(n.id)) {
          try {
            await sleep(idleMs, signal);
          } catch {
            return;
          }
          if (hasBufferedDelta(n.id)) continue;
          if (laterHasDelta(n.id) || sourceEnded || hasNextQueued(n.id)) {
            closed = true;
            break;
          }
        }

        if (sourceEnded) {
          closed = true;
          break;
        }
        await waitTick();
      }

      played.add(n.id);

      if (errorEv && sourceEnded && !nextPlayable()) {
        yield errorEv;
        return;
      }
    }
  } finally {
    await producer.catch(() => undefined);
  }
}
