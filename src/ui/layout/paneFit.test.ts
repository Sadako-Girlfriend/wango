import { describe, expect, it } from "vitest";
import { fitSideWidths } from "./paneFit";

describe("fitSideWidths", () => {
  it("keeps preferred widths when body is wide enough", () => {
    const r = fitSideWidths({
      bodyWidth: 1400,
      preferTree: 320,
      preferAgent: 360,
      treeCollapsed: false,
      agentWanted: true,
    });
    expect(r).toEqual({
      tree: 320,
      agent: 360,
      overlayAgent: false,
    });
  });

  it("shrinks agent then tree before crushing the main pane", () => {
    // 900 - 20 pad - 28 splits = 852; 320+360+300 = 980 → overflow 128
    const r = fitSideWidths({
      bodyWidth: 900,
      preferTree: 320,
      preferAgent: 360,
      treeCollapsed: false,
      agentWanted: true,
      mainMin: 300,
    });
    expect(r.overlayAgent).toBe(false);
    expect(r.tree + r.agent + 300).toBeLessThanOrEqual(900 - 20 - 28);
    expect(r.agent).toBeLessThan(360);
  });

  it("overlays agent instead of collapsing tree when mins still overflow", () => {
    const r = fitSideWidths({
      bodyWidth: 700,
      preferTree: 320,
      preferAgent: 360,
      treeCollapsed: false,
      agentWanted: true,
      mainMin: 300,
    });
    expect(r.overlayAgent).toBe(true);
    expect(r.agent).toBeGreaterThanOrEqual(280);
    // 左树仍按无 Agent 布局保留，不收起
    expect(r.tree).toBeGreaterThan(0);
    expect(r.tree + 300).toBeLessThanOrEqual(700 - 20 - 14);
  });
});
