import { describe, expect, it } from "vitest";
import { convertGfmTablesToHtml } from "./markdownTables";

describe("convertGfmTablesToHtml", () => {
  it("管道表转 HTML", () => {
    const md = [
      "说明",
      "",
      "| 直角边 a | 直角边 b | 斜边 c |",
      "| --- | --- | --- |",
      "| 3 | 4 | 5 |",
      "| 5 | 12 | 13 |",
      "",
      "后文",
    ].join("\n");
    const out = convertGfmTablesToHtml(md);
    expect(out).toContain("<table>");
    expect(out).toContain("<th>直角边 a</th>");
    expect(out).toContain("<td>3</td>");
    expect(out).toContain("说明");
    expect(out).toContain("后文");
    expect(out).not.toMatch(/^\| 直角边/m);
  });

  it("无表不动", () => {
    expect(convertGfmTablesToHtml("普通段落")).toBe("普通段落");
  });
});
