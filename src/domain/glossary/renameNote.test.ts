import { describe, expect, it } from "vitest";
import { renameNoteForLink, titleLineage } from "./renameNote";

describe("titleLineage", () => {
  it("多次改名还原时间线", () => {
    expect(
      titleLineage(
        [
          { from: "A", to: "B", at: "1" },
          { from: "B", to: "C", at: "2" },
        ],
        "C",
      ),
    ).toEqual(["A", "B", "C"]);
  });
});

describe("renameNoteForLink", () => {
  const hist2 = [
    { from: "未命名", to: "框架", at: "1" },
    { from: "框架", to: "结构", at: "2" },
  ];

  it("无改名历史不标注", () => {
    expect(
      renameNoteForLink(
        { matchedText: "结构", originText: "结构" },
        [],
        "结构",
      ),
    ).toBeNull();
  });

  it("旧名时期引用：已改名", () => {
    const note = renameNoteForLink(
      { matchedText: "结构", originText: "未命名" },
      hist2,
      "结构",
    );
    expect(note).toEqual({
      kind: "legacy",
      origin: "未命名",
      generations: 2,
    });
  });

  it("中间名时期引用：经一次再到当前", () => {
    const note = renameNoteForLink(
      { matchedText: "结构", originText: "框架" },
      hist2,
      "结构",
    );
    expect(note).toEqual({
      kind: "legacy",
      origin: "框架",
      generations: 1,
    });
  });

  it("当前名下新建：改名后新引用", () => {
    const note = renameNoteForLink(
      { matchedText: "结构", originText: "结构" },
      hist2,
      "结构",
    );
    expect(note).toEqual({
      kind: "after",
      origin: "结构",
      generations: 2,
    });
  });
});
