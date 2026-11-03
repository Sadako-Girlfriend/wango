import { describe, expect, it } from "vitest";
import {
  extractNumberedHits,
  parseNumberedLine,
  splitPasteByNumbers,
  wrapImportRoot,
} from "./pasteSplit";

describe("parseNumberedLine", () => {
  it("识别 1. / 1、 / 1) / （1） / (1)", () => {
    expect(parseNumberedLine("1. 标题")?.parts).toEqual([1]);
    expect(parseNumberedLine("1、标题")?.rest).toBe("标题");
    expect(parseNumberedLine("2) 第二节")?.parts).toEqual([2]);
    expect(parseNumberedLine("（3）括号")?.parts).toEqual([3]);
    expect(parseNumberedLine("(4) paren")?.marker).toBe("4");
  });

  it("识别点分多级与尾点", () => {
    expect(parseNumberedLine("1.1 子项")?.parts).toEqual([1, 1]);
    expect(parseNumberedLine("1.1.1. 细项")?.parts).toEqual([1, 1, 1]);
    expect(parseNumberedLine("1.标题无空格")?.rest).toBe("标题无空格");
  });

  it("拒绝纯数字与无分隔粘连", () => {
    expect(parseNumberedLine("42")).toBeNull();
    expect(parseNumberedLine("普通一行")).toBeNull();
  });
});

describe("splitPasteByNumbers", () => {
  it("按深度建树并保留导语", () => {
    const text = [
      "这是一段开场白。",
      "",
      "1. 第一章",
      "章内容甲",
      "1.1 小节",
      "小节正文",
      "2. 第二章",
      "章内容乙",
    ].join("\n");
    const result = splitPasteByNumbers(text);
    expect(result.hitCount).toBe(3);
    expect(result.weak).toBe(false);
    expect(result.children[0]?.title).toBe("导语");
    expect(result.children[0]?.content).toContain("开场白");
    expect(result.children[1]?.title).toBe("第一章");
    expect(result.children[1]?.children[0]?.title).toBe("小节");
    expect(result.children[1]?.children[0]?.content).toContain("小节正文");
    expect(result.children[2]?.title).toBe("第二章");
  });

  it("跳级时挂到最近合法祖先", () => {
    const text = ["1. A", "1.1.1 深", "2. B"].join("\n");
    const { hits } = extractNumberedHits(text);
    expect(hits.map((h) => h.parts)).toEqual([[1], [1, 1, 1], [2]]);
    const { children } = splitPasteByNumbers(text);
    // 1.1.1 在无 1.1 时仍挂在 1 下（栈深度回退到 < 3）
    expect(children[0]?.children[0]?.title).toBe("深");
    expect(children[1]?.title).toBe("B");
  });

  it("几乎无序号时 weak", () => {
    const r = splitPasteByNumbers("只有一段话\n没有编号");
    expect(r.hitCount).toBe(0);
    expect(r.weak).toBe(true);
    expect(r.children).toHaveLength(1);
    expect(r.children[0]?.title).toBe("导语");
  });

  it("wrapImportRoot 包导入根", () => {
    const { children } = splitPasteByNumbers("1. 甲\n2. 乙");
    const root = wrapImportRoot(children, "粘贴导入");
    expect(root.title).toBe("粘贴导入");
    expect(root.children).toHaveLength(2);
  });
});
