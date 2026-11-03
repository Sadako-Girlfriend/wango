import { describe, expect, it } from "vitest";
import {
  eventMatchesChord,
  findHotkeyConflicts,
  mergeHotkeys,
  normalizeChord,
} from "./defaults";

describe("hotkey chords", () => {
  it("normalize Ctrl+Enter", () => {
    expect(normalizeChord("ctrl+enter")).toBe("Ctrl+Enter");
    expect(normalizeChord("Ctrl+]")).toBe("Ctrl+]");
  });

  it("match event-like object to chord", () => {
    const e = {
      key: "Enter",
      code: "Enter",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    } as KeyboardEvent;
    expect(eventMatchesChord(e, "Ctrl+Enter")).toBe(true);
    expect(eventMatchesChord(e, "Alt+1")).toBe(false);
  });

  it("detect conflicts", () => {
    const map = mergeHotkeys({
      addChild: "Ctrl+Enter",
      addSibling: "Ctrl+Enter",
    });
    const c = findHotkeyConflicts(map);
    expect(c.some((g) => g.includes("addChild") && g.includes("addSibling"))).toBe(
      true,
    );
  });
});
