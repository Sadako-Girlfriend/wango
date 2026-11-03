import { describe, expect, it } from "vitest";
import { mapActiveDecorationRanges } from "./glossaryDecorations";
import type { GlossaryLink } from "@/domain";

function link(
  partial: Pick<
    GlossaryLink,
    "id" | "start" | "end" | "matchedText" | "status"
  > &
    Partial<GlossaryLink>,
): GlossaryLink {
  return {
    entryId: "e1",
    hostNodeId: "h1",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("mapActiveDecorationRanges", () => {
  it("同选区多绑共用同一命中", () => {
    const plain = "林启拿着剑";
    const links = [
      link({
        id: "m1",
        entryId: "e-a",
        start: 0,
        end: 5,
        matchedText: "林启拿着剑",
        status: "active",
        source: "manual",
      }),
      link({
        id: "m2",
        entryId: "e-b",
        start: 0,
        end: 5,
        matchedText: "林启拿着剑",
        status: "active",
        source: "manual",
      }),
    ];
    const painted = mapActiveDecorationRanges(plain, links, "h1");
    expect(painted).toHaveLength(2);
    expect(painted[0].from).toBe(0);
    expect(painted[1].from).toBe(0);
  });

  it("同名自动疑似不影响手动高亮", () => {
    const plain = "艾莉丝去了";
    const links = [
      link({
        id: "auto",
        entryId: "e-parent",
        start: 0,
        end: 3,
        matchedText: "艾莉丝",
        status: "active",
        source: "auto",
      }),
      link({
        id: "manual",
        entryId: "e-parent",
        start: 0,
        end: 3,
        matchedText: "艾莉丝",
        status: "active",
        source: "manual",
        occurrenceIndex: 0,
      }),
    ];
    const painted = mapActiveDecorationRanges(plain, links, "h1");
    expect(painted.map((p) => p.link.id)).toEqual(["manual"]);
    expect(painted[0].from).toBe(0);
  });

  it("同名两处：occurrenceIndex 对齐第二处", () => {
    const plain = "张三来了，张三走了";
    const i1 = plain.indexOf("张三", plain.indexOf("张三") + 1);
    const painted = mapActiveDecorationRanges(
      plain,
      [
        link({
          id: "manual1",
          entryId: "e1",
          start: 99,
          end: 101,
          matchedText: "张三",
          status: "active",
          source: "manual",
          occurrenceIndex: 1,
        }),
      ],
      "h1",
    );
    expect(painted).toHaveLength(1);
    expect(painted[0].from).toBe(i1);
  });

  it("自动链不绘制", () => {
    const plain = "林启拔剑";
    const painted = mapActiveDecorationRanges(
      plain,
      [
        link({
          id: "auto",
          entryId: "e1",
          start: 0,
          end: 2,
          matchedText: "林启",
          status: "active",
          source: "auto",
        }),
      ],
      "h1",
    );
    expect(painted).toHaveLength(0);
  });
});
