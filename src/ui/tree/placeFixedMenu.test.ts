import { describe, expect, it } from "vitest";
import { placeFixedMenu } from "./placeFixedMenu";

describe("placeFixedMenu", () => {
  const menu = { menuWidth: 180, menuHeight: 360 };

  it("偏上时向下展开", () => {
    const r = placeFixedMenu({
      ...menu,
      anchorX: 40,
      anchorY: 50,
      viewportWidth: 1200,
      viewportHeight: 800,
    });
    expect(r.y).toBe(50);
    expect(r.maxHeight).toBeUndefined();
  });

  it("偏下时向上展开", () => {
    const r = placeFixedMenu({
      ...menu,
      anchorX: 40,
      anchorY: 750,
      viewportWidth: 1200,
      viewportHeight: 800,
    });
    expect(r.y).toBe(750 - 360);
    expect(r.maxHeight).toBeUndefined();
  });

  it("贴右缘时水平夹紧", () => {
    const r = placeFixedMenu({
      ...menu,
      anchorX: 1180,
      anchorY: 100,
      viewportWidth: 1200,
      viewportHeight: 800,
    });
    expect(r.x).toBe(1200 - 180 - 8);
  });

  it("视口极矮时限制高度并可落在上方", () => {
    const r = placeFixedMenu({
      ...menu,
      anchorX: 40,
      anchorY: 200,
      viewportWidth: 800,
      viewportHeight: 300,
    });
    expect(r.maxHeight).toBeDefined();
    expect(r.maxHeight!).toBeLessThan(360);
    expect(r.y).toBeGreaterThanOrEqual(8);
    expect(r.y + (r.maxHeight ?? 0)).toBeLessThanOrEqual(300 - 8);
  });
});
