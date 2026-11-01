import { describe, expect, it } from "vitest";
import type { InspireEvent } from "./inspireProtocol";
import { typewriterPace } from "./inspireTypewriter";

async function* oneDelta(): AsyncGenerator<InspireEvent> {
  yield { type: "delta", id: "n1", text: "你好" };
  yield { type: "done" };
}

describe("typewriterPace", () => {
  it("splits delta into single code points", async () => {
    const out: InspireEvent[] = [];
    for await (const ev of typewriterPace(oneDelta(), { intervalMs: 0 })) {
      out.push(ev);
    }
    expect(out.filter((e) => e.type === "delta")).toEqual([
      { type: "delta", id: "n1", text: "你" },
      { type: "delta", id: "n1", text: "好" },
    ]);
    expect(out.at(-1)).toEqual({ type: "done" });
  });
});
