import { describe, expect, it } from "vitest";
import type { InspireEvent } from "./inspireProtocol";
import { serializeInspirePlayback } from "./inspireSerial";

async function collect(
  source: AsyncIterable<InspireEvent>,
  idleMs = 20,
): Promise<InspireEvent[]> {
  const out: InspireEvent[] = [];
  for await (const ev of serializeInspirePlayback(source, { idleMs })) {
    out.push(ev);
  }
  return out;
}

async function* fromArray(
  events: InspireEvent[],
  gapMs = 0,
): AsyncGenerator<InspireEvent, void, undefined> {
  for (const ev of events) {
    if (gapMs) await new Promise((r) => setTimeout(r, gapMs));
    yield ev;
  }
}

describe("serializeInspirePlayback", () => {
  it("holds later nodes until current deltas finish (nodes-first dump)", async () => {
    async function* source(): AsyncGenerator<InspireEvent> {
      yield { type: "project", name: "P" };
      yield { type: "node", id: "n1", parentId: null, title: "A" };
      yield { type: "node", id: "n2", parentId: "n1", title: "B" };
      yield { type: "delta", id: "n1", text: "hello" };
      yield { type: "delta", id: "n1", text: " world" };
      yield { type: "delta", id: "n2", text: "child" };
      yield { type: "done" };
    }

    const out = await collect(source());
    const types = out.map((e) => e.type);
    expect(types[0]).toBe("project");
    expect(out[1]).toMatchObject({ type: "node", id: "n1" });
    expect(out[2]).toMatchObject({ type: "delta", id: "n1", text: "hello" });
    expect(out[3]).toMatchObject({
      type: "delta",
      id: "n1",
      text: " world",
    });
    expect(out[4]).toMatchObject({ type: "node", id: "n2" });
    expect(out[5]).toMatchObject({ type: "delta", id: "n2", text: "child" });
    expect(out.at(-1)).toEqual({ type: "done" });

    const firstN2 = out.findIndex((e) => e.type === "node" && e.id === "n2");
    const lastN1Delta = out
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.type === "delta" && e.id === "n1")
      .at(-1)!.i;
    expect(firstN2).toBeGreaterThan(lastN1Delta);
  });

  it("plays parent before child even if child node arrives early", async () => {
    const out = await collect(
      fromArray([
        { type: "node", id: "c", parentId: "p", title: "Child" },
        { type: "node", id: "p", parentId: null, title: "Parent" },
        { type: "delta", id: "p", text: "P" },
        { type: "delta", id: "c", text: "C" },
        { type: "done" },
      ]),
    );
    const nodeIds = out.filter((e) => e.type === "node").map((e) => e.id);
    expect(nodeIds).toEqual(["p", "c"]);
  });

  it("outline-only: nodes appear one-by-one after stream ends", async () => {
    const out = await collect(
      fromArray([
        { type: "node", id: "n1", parentId: null, title: "A" },
        { type: "node", id: "n2", parentId: null, title: "B" },
        { type: "done" },
      ]),
    );
    expect(out.filter((e) => e.type === "node").map((e) => e.id)).toEqual([
      "n1",
      "n2",
    ]);
    expect(out.filter((e) => e.type === "delta")).toHaveLength(0);
  });
});
