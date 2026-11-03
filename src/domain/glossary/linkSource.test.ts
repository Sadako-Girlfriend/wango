import { describe, expect, it } from "vitest";
import {
  findLooseInMarkdown,
  findNthOccurrence,
  locateAnchorInHost,
  occurrenceIndexBefore,
  realignManualLink,
  shouldHighlightLink,
} from "./linkSource";
import type { GlossaryLink } from "../types";

function manual(partial: Partial<GlossaryLink> = {}): GlossaryLink {
  return {
    id: "l1",
    entryId: "e1",
    hostNodeId: "n1",
    start: 0,
    end: 2,
    matchedText: "林启",
    anchorText: "林启",
    source: "manual",
    status: "active",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("linkSource", () => {
  it("findNthOccurrence / occurrenceIndexBefore", () => {
    const s = "林启走了，林启又来";
    expect(findNthOccurrence(s, "林启", 0)).toEqual({ start: 0, end: 2 });
    expect(findNthOccurrence(s, "林启", 1)?.start).toBe(5);
    expect(occurrenceIndexBefore(s, "林启", 5)).toBe(1);
  });

  it("only manual active/modified highlights", () => {
    expect(shouldHighlightLink(manual())).toBe(true);
    expect(
      shouldHighlightLink(manual({ source: "auto", status: "active" })),
    ).toBe(false);
    expect(shouldHighlightLink(manual({ status: "removed" }))).toBe(false);
  });

  it("realignManualLink finds closest anchor", () => {
    // 旧偏移靠近第二次「林启」(index 6)
    const link = manual({ start: 5, end: 7 });
    const next = realignManualLink(link, "xx林启yy林启zz");
    expect(next.start).toBe(6);
    expect(next.end).toBe(8);
    expect(next.status).toBe("active");
  });

  it("realignManualLink marks modified when lost", () => {
    const next = realignManualLink(manual(), "没有这个名字");
    expect(next.status).toBe("modified");
    expect(next.reason).toBe("锚点丢失");
  });

  it("locateAnchorInHost bridges plain selection across markdown marks", () => {
    const md = "他说**林启**好";
    expect(findLooseInMarkdown(md, "林启")).toEqual({ start: 4, end: 6 });
    expect(locateAnchorInHost(md, "林启", 0)).toEqual({ start: 4, end: 6 });
    // 跨加粗：纯文本「林启好」在 md 中不连续
    expect(locateAnchorInHost("前**林启**好后", "林启好", 0)).toEqual({
      start: 3,
      end: 8,
    });
    // 列表标记只在 md 里，选区纯文本无「- 」
    expect(locateAnchorInHost("- 林启去了", "林启", 0)).toEqual({
      start: 2,
      end: 4,
    });
  });

  it("realignManualLink recovers via loose match", () => {
    const next = realignManualLink(
      manual({ matchedText: "林启好", anchorText: "林启好", start: 0, end: 3 }),
      "前**林启**好后",
    );
    expect(next.status).toBe("active");
    expect(next.start).toBe(3);
    expect(next.end).toBe(8);
  });
});
