import { describe, expect, it } from "vitest";
import {
  formatSearchContextForAgent,
  toolsApiRoot,
} from "./deepseekTools";

describe("toolsApiRoot", () => {
  it("补全 /v1", () => {
    expect(toolsApiRoot("https://api.deepseek.com")).toBe(
      "https://api.deepseek.com/v1",
    );
  });

  it("已有 /v1 不重复", () => {
    expect(toolsApiRoot("https://api.deepseek.com/v1/")).toBe(
      "https://api.deepseek.com/v1",
    );
  });

  it("去掉 chat/completions", () => {
    expect(
      toolsApiRoot("https://api.deepseek.com/v1/chat/completions"),
    ).toBe("https://api.deepseek.com/v1");
  });
});

describe("formatSearchContextForAgent", () => {
  it("空结果为空串", () => {
    expect(formatSearchContextForAgent([], "q")).toBe("");
  });

  it("含标题与 URL", () => {
    const text = formatSearchContextForAgent(
      [
        {
          title: "测试",
          url: "https://example.com",
          summary: "摘要内容",
        },
      ],
      "欧姆定律",
    );
    expect(text).toContain("欧姆定律");
    expect(text).toContain("测试");
    expect(text).toContain("https://example.com");
    expect(text).toContain("摘要内容");
  });
});
