import { describe, expect, it } from "vitest";
import {
  convertDollarMathToHtml,
  normalizeMathInMarkdown,
  rescueBareTexCommands,
  rescueBareTexInLine,
} from "./mathMarkdown";

describe("convertDollarMathToHtml", () => {
  it("块级 $$ 转 math-block", () => {
    const out = convertDollarMathToHtml("前言\n$$a^2+b^2=c^2$$\n后");
    expect(out).toContain('data-type="math-block"');
    expect(out).toContain('data-latex="a^2+b^2=c^2"');
    expect(out).not.toContain("$$");
  });

  it("行内 $ 转 math-inline", () => {
    const out = convertDollarMathToHtml("勾股定理：$a^2+b^2=c^2$ 成立");
    expect(out).toContain('data-type="math-inline"');
    expect(out).toContain('data-latex="a^2+b^2=c^2"');
  });

  it("货币 $5 不转", () => {
    expect(convertDollarMathToHtml("价格 $5 即可")).toBe("价格 $5 即可");
  });

  it("跳过代码块里的 $", () => {
    const md = "```js\nconst x = '$a$'\n```\n外 $E=mc^2$";
    const out = convertDollarMathToHtml(md);
    expect(out).toContain("const x = '$a$'");
    expect(out).toContain('data-type="math-inline"');
  });

  it("已有公式 HTML 不二次包装", () => {
    const md =
      '<span data-type="math-inline" data-latex="x">x</span> 与 $y$';
    const out = normalizeMathInMarkdown(md);
    expect(out.match(/data-type="math-inline"/g)?.length).toBe(2);
  });
});

describe("rescueBareTexCommands", () => {
  it("整行裸 \\times\\frac 转块级公式", () => {
    const out = rescueBareTexCommands("S=4\\times\\frac{1}{2}ab+c^2");
    expect(out).toContain('data-type="math-block"');
    expect(out).toContain("4\\times\\frac{1}{2}ab+c^2");
  });

  it("冒号后算式转行内", () => {
    const out = rescueBareTexInLine(
      "两种算法面积相等：(a+b)^2=4\\times\\frac{1}{2}ab+c^2",
    );
    expect(out).toContain("两种算法面积相等：");
    expect(out).toContain('data-type="math-inline"');
    expect(out).toContain("\\times");
  });

  it("代码块内裸 TeX 不转", () => {
    const md = "```tex\n\\frac{1}{2}\n```\n外 \\times a";
    const out = rescueBareTexCommands(md);
    expect(out).toContain("```tex\n\\frac{1}{2}\n```");
  });

  it("normalize：先 $ 再抢救裸命令", () => {
    const md =
      "有 $a+b$\n\nS=4\\times\\frac{1}{2}ab+c^2\n\n无公式散文。";
    const out = normalizeMathInMarkdown(md);
    expect(out).toContain('data-latex="a+b"');
    expect(out).toContain('data-type="math-block"');
    expect(out).toContain("无公式散文");
  });

  it("路径类反斜杠不强转", () => {
    expect(rescueBareTexCommands("见 C:\\Users\\foo")).toBe(
      "见 C:\\Users\\foo",
    );
  });
});
