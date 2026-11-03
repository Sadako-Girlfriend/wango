import { describe, expect, it } from "vitest";
import { applyGlossaryMarksToMarkdown } from "./glossaryExportMark";
import type { GlossaryLink } from "@/domain";

function link(
  partial: Partial<GlossaryLink> &
    Pick<GlossaryLink, "hostNodeId" | "start" | "end" | "matchedText">,
): GlossaryLink {
  return {
    id: partial.id ?? "l1",
    entryId: partial.entryId ?? "e1",
    hostNodeId: partial.hostNodeId,
    start: partial.start,
    end: partial.end,
    matchedText: partial.matchedText,
    source: partial.source ?? "manual",
    status: partial.status ?? "active",
    updatedAt: partial.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("applyGlossaryMarksToMarkdown", () => {
  it("wraps active hits with default class", () => {
    const md = "hello 万构 world";
    const out = applyGlossaryMarksToMarkdown(
      md,
      [link({ hostNodeId: "n1", start: 6, end: 8, matchedText: "万构" })],
      "n1",
      {},
    );
    expect(out).toContain('<span class="wg-glossary-link">万构</span>');
    expect(out).toContain("hello ");
    expect(out).toContain(" world");
  });

  it("applies custom color style", () => {
    const md = "术语甲";
    const out = applyGlossaryMarksToMarkdown(
      md,
      [
        link({
          hostNodeId: "n1",
          entryId: "e-red",
          start: 0,
          end: 3,
          matchedText: "术语甲",
        }),
      ],
      "n1",
      { "e-red": "#c00000" },
    );
    expect(out).toContain("background-color:color-mix(in srgb,#c00000");
    expect(out).toContain("术语甲");
  });

  it("ignores other hosts and blocked links", () => {
    const md = "甲乙";
    const out = applyGlossaryMarksToMarkdown(
      md,
      [
        link({
          hostNodeId: "other",
          start: 0,
          end: 1,
          matchedText: "甲",
        }),
        link({
          hostNodeId: "n1",
          start: 1,
          end: 2,
          matchedText: "乙",
          status: "blocked",
        }),
      ],
      "n1",
      {},
    );
    expect(out).toBe(md);
  });
});
