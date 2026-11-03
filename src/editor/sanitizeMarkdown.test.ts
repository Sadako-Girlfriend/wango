import { describe, expect, it } from "vitest";
import {
  sanitizeMarkdownContent,
  stripPasteHtml,
} from "./sanitizeMarkdown";

describe("sanitizeMarkdownContent", () => {
  it("剥掉粘贴带来的 span style", () => {
    const dirty =
      '入口：在具体的词条右键 -&gt; 选择“记录”\n\n<span style="color: rgb(0, 0, 0); font-family: &quot;PingFang SC&quot;, Arial;">（弹出可拖拽的悬浮日志面板）\\</span>';
    const clean = sanitizeMarkdownContent(dirty);
    expect(clean).not.toMatch(/<span/i);
    expect(clean).not.toMatch(/font-family/i);
    expect(clean).toContain("弹出可拖拽的悬浮日志面板");
    expect(clean).not.toMatch(/\\$/m);
  });

  it("压缩多余空行", () => {
    expect(sanitizeMarkdownContent("a\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("stripPasteHtml", () => {
  it("去掉 span 外壳与 style", () => {
    const html =
      '<p><span style="color: rgb(0, 0, 0); font-family: Arial;">你好</span></p>';
    const out = stripPasteHtml(html);
    expect(out).not.toMatch(/span/i);
    expect(out).not.toMatch(/style=/i);
    expect(out).toContain("你好");
  });
});
