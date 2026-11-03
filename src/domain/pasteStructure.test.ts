import { describe, expect, it } from "vitest";
import { splitMarkdownOutline } from "./outlineFileImport";
import {
  extractBlocksFromHtml,
  isLikelyTitleLine,
  splitPasteByStructure,
  splitPasteByTitles,
} from "./pasteStructure";

describe("isLikelyTitleLine", () => {
  it("接受短标题、拒绝字段行", () => {
    expect(isLikelyTitleLine("银橡木议会")).toBe(true);
    expect(isLikelyTitleLine("核心：大主教及高层。")).toBe(false);
    expect(isLikelyTitleLine("1. 第一章")).toBe(false);
  });
});

describe("splitPasteByTitles", () => {
  it("按短标题切块", () => {
    const text = [
      "银橡木议会",
      "核心：大主教。",
      "诉求：巩固神权。",
      "青月修会",
      "核心：塞西莉亚。",
    ].join("\n");
    const r = splitPasteByTitles(text);
    expect(r.hitCount).toBe(2);
    expect(r.children[0]?.title).toBe("银橡木议会");
    expect(r.children[0]?.content).toContain("核心：大主教");
    expect(r.children[1]?.title).toBe("青月修会");
  });
});

describe("splitPasteByStructure", () => {
  it("序号足够时优先序号", () => {
    const r = splitPasteByStructure({
      text: "1. A\n正文\n1.1 A1\n2. B\n",
    });
    expect(r.kind).toBe("numbers");
    expect(r.hitCount).toBe(3);
  });

  it("无序号时走标题", () => {
    const r = splitPasteByStructure({
      text: "甲阵营\n核心：甲方说明若干。\n乙阵营\n核心：乙方说明若干。\n",
    });
    expect(r.kind).toBe("titles");
    expect(r.hitCount).toBe(2);
  });

  it("HTML 标题优先", () => {
    const r = splitPasteByStructure({
      text: "忽略",
      html: "<h1>一</h1><p>正文一</p><h2>二</h2><p>正文二</p>",
    });
    expect(r.kind).toBe("html");
    expect(r.children[0]?.title).toBe("一");
    expect(r.children[0]?.children[0]?.title).toBe("二");
  });
});

describe("extractBlocksFromHtml", () => {
  it("识别 heading class", () => {
    const blocks = extractBlocksFromHtml(
      '<p class="MsoHeading1">标题</p><p>段</p>',
    );
    expect(blocks.some((b) => b.level === 1 && b.text === "标题")).toBe(true);
  });
});

describe("splitMarkdownOutline", () => {
  it("按 # 建树", () => {
    const r = splitMarkdownOutline("# A\nhello\n## A1\n# B\n");
    expect(r.hitCount).toBe(3);
    expect(r.children[0]?.title).toBe("A");
    expect(r.children[0]?.children[0]?.title).toBe("A1");
  });
});
