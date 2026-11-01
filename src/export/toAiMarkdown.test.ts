import { describe, expect, it } from "vitest";
import { createNode } from "@/domain";
import { toAiMarkdown } from "./toAiMarkdown";
import { toMindmapMarkdown } from "./toMindmapMarkdown";

describe("export P0", () => {
  it("AI Markdown 含编号与正文", () => {
    const child = createNode({
      id: "c",
      title: "子主题",
      content: "细节说明",
    });
    const root = createNode({
      id: "r",
      title: "根主题",
      content: "概述",
      children: [child],
    });
    const md = toAiMarkdown([root]);
    expect(md).toContain("# 1 根主题");
    expect(md).toContain("概述");
    expect(md).toContain("## 1.1 子主题");
    expect(md).toContain("细节说明");
  });

  it("AI Markdown 标题带优先级与文字标签", () => {
    const root = createNode({
      id: "r",
      title: "登录",
      content: "说明",
      priority: "high",
      labels: ["后端", "本周"],
    });
    const md = toAiMarkdown([root]);
    expect(md).toContain("# 1 登录 [高] #后端 #本周");
    expect(md).toContain("说明");
  });

  it("思维导图只含标题列表", () => {
    const root = createNode({
      id: "r",
      title: "根",
      content: "不应出现",
      children: [createNode({ id: "c", title: "子" })],
    });
    const md = toMindmapMarkdown([root]);
    expect(md).toContain("- 根");
    expect(md).toContain("- 子");
    expect(md).not.toContain("不应出现");
  });
});
