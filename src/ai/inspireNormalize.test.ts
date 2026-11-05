import { describe, expect, it } from "vitest";
import { createId, type TreeNode } from "@/domain";
import {
  liftOverviewWrapper,
  normalizeInspireTree,
  splitByNumberedHeadings,
} from "./inspireNormalize";

function node(
  title: string,
  content = "",
  children: TreeNode[] = [],
): TreeNode {
  return {
    id: createId(),
    title,
    content,
    children,
    attachments: [],
  };
}

describe("splitByNumberedHeadings", () => {
  it("splits ## 1.1 style sections", () => {
    const md = `导语

## 1.1 体验主线

内容A

## 1.2 目标用户

内容B`;
    const { intro, sections } = splitByNumberedHeadings(md);
    expect(intro).toBe("导语");
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({
      num: "1.1",
      heading: "体验主线",
      body: "内容A",
    });
  });
});

describe("normalizeInspireTree", () => {
  it("lifts chapters out of overview and splits missing subsections", () => {
    const tree = [
      node(
        "0. 总览：产品",
        "总述一段",
        [
          node(
            "1. 产品定位",
            `## 1.1 体验主线

闭环

## 1.2 目标用户

人群

## 1.3 指标

表`,
            [node("1.4 总体架构", "五层")],
          ),
          node("2. 语音", "语音导语", [
            node("2.1 采集", "采集细节"),
          ]),
          node("3. 记忆", "记忆导语"),
        ],
      ),
    ];

    const next = normalizeInspireTree(tree);
    expect(next.map((n) => n.title)).toEqual([
      "总览：产品",
      "产品定位",
      "语音",
      "记忆",
    ]);
    expect(next[0].children).toHaveLength(0);
    expect(next[1].children.map((c) => c.title)).toEqual([
      "体验主线",
      "目标用户",
      "指标",
      "总体架构",
    ]);
    expect(next[1].content).toBe("");
    expect(next[1].children[0].content).toContain("闭环");
    expect(next[2].children[0].title).toBe("采集");
  });

  it("does not lift ordinary single-root apps", () => {
    const tree = [
      node("手机桌宠 App", "", [
        node("语音", ""),
        node("记忆", ""),
        node("工具", ""),
      ]),
    ];
    const next = liftOverviewWrapper(tree);
    expect(next).toHaveLength(1);
    expect(next[0].children).toHaveLength(3);
  });
});
