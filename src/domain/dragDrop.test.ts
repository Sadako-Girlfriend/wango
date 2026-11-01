import { describe, expect, it } from "vitest";
import { resolveDropTarget, flattenVisible, placementFromRatio } from "./dragDrop";
import { createNode, moveNode } from "./tree";

describe("dragDrop", () => {
  it("扁平化尊重折叠", () => {
    const c = createNode({ id: "c", title: "C" });
    const b = createNode({ id: "b", title: "B", children: [c] });
    const a = createNode({ id: "a", title: "A", children: [b] });
    const flat = flattenVisible([a], { b: true });
    expect(flat.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("placementFromRatio 三段", () => {
    expect(placementFromRatio(0.1)).toBe("before");
    expect(placementFromRatio(0.5)).toBe("inside");
    expect(placementFromRatio(0.9)).toBe("after");
  });

  it("同级 after 移动", () => {
    const a = createNode({ id: "a", title: "A" });
    const b = createNode({ id: "b", title: "B" });
    const c = createNode({ id: "c", title: "C" });
    const tree = [a, b, c];
    const target = resolveDropTarget(tree, "a", "c", "after");
    expect(target).toEqual({ parentId: null, index: 2 });
    const next = moveNode(tree, "a", target!.parentId, target!.index);
    expect(next.map((n) => n.id)).toEqual(["b", "c", "a"]);
  });

  it("同级从前往后 before 校正下标", () => {
    const a = createNode({ id: "a", title: "A" });
    const b = createNode({ id: "b", title: "B" });
    const c = createNode({ id: "c", title: "C" });
    const tree = [a, b, c];
    // 把 a 放到 c 前面 → [b, a, c]
    const target = resolveDropTarget(tree, "a", "c", "before");
    const next = moveNode(tree, "a", target!.parentId, target!.index);
    expect(next.map((n) => n.id)).toEqual(["b", "a", "c"]);
  });

  it("inside 成为子节点", () => {
    const a = createNode({ id: "a", title: "A" });
    const b = createNode({ id: "b", title: "B" });
    const tree = [a, b];
    const target = resolveDropTarget(tree, "b", "a", "inside");
    expect(target).toEqual({ parentId: "a", index: 0 });
    const next = moveNode(tree, "b", target!.parentId, target!.index);
    expect(next).toHaveLength(1);
    expect(next[0].children[0].id).toBe("b");
  });

  it("禁止拖到子孙", () => {
    const c = createNode({ id: "c", title: "C" });
    const b = createNode({ id: "b", title: "B", children: [c] });
    const a = createNode({ id: "a", title: "A", children: [b] });
    expect(resolveDropTarget([a], "a", "c", "before")).toBeNull();
    expect(resolveDropTarget([a], "a", "b", "inside")).toBeNull();
  });
});
