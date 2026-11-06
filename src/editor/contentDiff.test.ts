import { describe, expect, it } from "vitest";
import {
  annotateContentDiff,
  coalesceDiffOps,
  diffContentBlocks,
  stripDiffAnnotations,
} from "./contentDiff";

describe("diffContentBlocks", () => {
  it("标出增删段", () => {
    const ops = diffContentBlocks("甲\n\n乙", "甲\n\n丙");
    expect(ops).toEqual([
      { type: "equal", text: "甲" },
      { type: "del", text: "乙" },
      { type: "add", text: "丙" },
    ]);
  });
});

describe("coalesceDiffOps", () => {
  it("相邻同类型合并", () => {
    expect(
      coalesceDiffOps([
        { type: "del", text: "甲" },
        { type: "del", text: "乙" },
        { type: "add", text: "丙" },
        { type: "add", text: "丁" },
      ]),
    ).toEqual([
      { type: "del", text: "甲\n\n乙" },
      { type: "add", text: "丙\n\n丁" },
    ]);
  });
});

describe("annotateContentDiff", () => {
  it("旧空则不标绿", () => {
    expect(annotateContentDiff("", "新段")).toBe("新段");
  });

  it("包一层 div 红绿壳", () => {
    const out = annotateContentDiff("旧段", "新段");
    expect(out).toContain('<div data-wg-diff="del">');
    expect(out).toContain("旧段");
    expect(out).toContain('<div data-wg-diff="add">');
    expect(out).toContain("新段");
    expect(out).not.toMatch(/<\/?(?:ins|del)\b/i);
  });

  it("相邻删除段合并为一个壳", () => {
    const out = annotateContentDiff("甲\n\n乙\n\n同", "同");
    const dels = out.match(/data-wg-diff="del"/g) ?? [];
    expect(dels).toHaveLength(1);
    expect(out).toContain("甲");
    expect(out).toContain("乙");
  });
});

describe("stripDiffAnnotations", () => {
  it("绿留红删", () => {
    const md = annotateContentDiff("旧\n\n同", "新\n\n同");
    const clean = stripDiffAnnotations(md);
    expect(clean).toContain("新");
    expect(clean).toContain("同");
    expect(clean).not.toContain("旧");
    expect(clean).not.toContain("data-wg-diff");
  });
});
