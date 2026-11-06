import { describe, expect, it } from "vitest";
import { createNode } from "./tree";
import {
  analyzeMarkdown,
  analyzeScope,
  analyzeSelection,
} from "./contentStats";

describe("analyzeMarkdown", () => {
  it("统计字数与标点", () => {
    const s = analyzeMarkdown("你好，世界！Hello.");
    expect(s.chars).toBeGreaterThan(0);
    expect(s.punctuation).toBeGreaterThanOrEqual(2);
    expect(s.codeBlocks).toBe(0);
    expect(s.callouts).toBe(0);
    expect(s.mathBlocks).toBe(0);
  });

  it("统计代码块与备注框", () => {
    const md = [
      "前言。",
      "```ts",
      "const a = 1;",
      "```",
      '<aside data-type="callout"><p>注意</p></aside>',
      '<div data-type="math-block" data-latex="\\sqrt{2}">\\sqrt{2}</div>',
      '勾股定理：<span data-type="math-inline" data-latex="a^2+b^2=c^2">a^2+b^2=c^2</span>',
      "结尾",
    ].join("\n");
    const s = analyzeMarkdown(md);
    expect(s.codeBlocks).toBe(1);
    expect(s.callouts).toBe(1);
    expect(s.mathBlocks).toBe(2);
    expect(s.chars).toBeGreaterThan(0);
  });
});

describe("analyzeScope", () => {
  it("nodeOnly 不含子节点", () => {
    const child = createNode({
      id: "c",
      title: "子",
      content: "子内容一二三",
    });
    const root = createNode({
      id: "r",
      title: "根",
      content: "根文",
      children: [child],
    });
    const only = analyzeScope({
      scope: "nodeOnly",
      tree: [root],
      current: root,
    });
    const withKids = analyzeScope({
      scope: "nodeWithChildren",
      tree: [root],
      current: root,
    });
    expect(withKids.chars).toBeGreaterThan(only.chars);
  });

  it("划词带 block 提示", () => {
    const s = analyzeSelection("print(1)", "code");
    expect(s.codeBlocks).toBe(1);
    expect(s.chars).toBeGreaterThan(0);
  });
});
