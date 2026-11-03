import { describe, expect, it } from "vitest";
import { normalizeLineHeight } from "./LineHeight";

describe("normalizeLineHeight", () => {
  it("接受合法倍数", () => {
    expect(normalizeLineHeight("1")).toBe("1");
    expect(normalizeLineHeight("1.5")).toBe("1.5");
    expect(normalizeLineHeight("1.75")).toBe("1.75");
    expect(normalizeLineHeight(" 2.5 ")).toBe("2.5");
  });

  it("规范化尾零", () => {
    expect(normalizeLineHeight("1.50")).toBe("1.5");
    expect(normalizeLineHeight("2.0")).toBe("2");
  });

  it("拒绝非法与越界", () => {
    expect(normalizeLineHeight("")).toBeNull();
    expect(normalizeLineHeight("normal")).toBeNull();
    expect(normalizeLineHeight("abc")).toBeNull();
    expect(normalizeLineHeight("0.5")).toBeNull();
    expect(normalizeLineHeight("5")).toBeNull();
    expect(normalizeLineHeight("12px")).toBeNull();
  });

  it("宽松剥 em/% 数字前缀", () => {
    expect(normalizeLineHeight("1.5em")).toBe("1.5");
    expect(normalizeLineHeight("150%")).toBeNull(); // 150 越界
  });
});
