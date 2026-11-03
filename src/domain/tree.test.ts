import { describe, expect, it } from "vitest";
import { withNumbering } from "./numbering";
import {
  addChild,
  createNode,
  demoteNode,
  dissolveNode,
  duplicateAsSibling,
  moveNode,
  promoteNode,
  releaseChildren,
  removeNode,
  updateNode,
} from "./tree";

describe("tree + numbering", () => {
  it("编号随结构派生", () => {
    const a = createNode({ id: "a", title: "A" });
    const b = createNode({ id: "b", title: "B" });
    const c = createNode({ id: "c", title: "C" });
    a.children = [b];
    b.children = [c];
    const numbered = withNumbering([a]);
    expect(numbered[0].number).toBe("1");
    expect(numbered[0].children[0].number).toBe("1.1");
    expect(numbered[0].children[0].children[0].number).toBe("1.1.1");
  });

  it("添加子节点与更新标题", () => {
    const root = createNode({ id: "r", title: "根" });
    let tree = [root];
    const child = createNode({ id: "c", title: "子" });
    tree = addChild(tree, "r", child);
    tree = updateNode(tree, "c", { title: "子改" });
    expect(tree[0].children[0].title).toBe("子改");
  });

  it("降级与升级", () => {
    const a = createNode({ id: "a", title: "A" });
    const b = createNode({ id: "b", title: "B" });
    let tree = [a, b];
    tree = demoteNode(tree, "b");
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].id).toBe("b");

    tree = promoteNode(tree, "b");
    expect(tree.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("移动节点且禁止移入子孙", () => {
    const a = createNode({ id: "a", title: "A" });
    const b = createNode({ id: "b", title: "B" });
    a.children = [b];
    let tree = [a];
    const blocked = moveNode(tree, "a", "b", 0);
    expect(blocked[0].children[0].id).toBe("b");

    const c = createNode({ id: "c", title: "C" });
    tree = [a, c];
    tree = moveNode(tree, "c", "a", 0);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((n) => n.id)).toContain("c");
  });

  it("删除节点", () => {
    const a = createNode({ id: "a", title: "A" });
    const b = createNode({ id: "b", title: "B" });
    a.children = [b];
    const tree = removeNode([a], "b");
    expect(tree[0].children).toHaveLength(0);
  });

  it("释放子节点：父保留，孩子升为同级", () => {
    const a = createNode({ id: "a", title: "A", content: "父文" });
    const b = createNode({ id: "b", title: "B" });
    const c = createNode({ id: "c", title: "C" });
    a.children = [b, c];
    const { tree, selectId } = releaseChildren([a], "a");
    expect(tree.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(tree[0].children).toHaveLength(0);
    expect(tree[0].content).toBe("父文");
    expect(selectId).toBe("b");
  });

  it("解散节点：孩子顶替父，正文并入首孩", () => {
    const a = createNode({ id: "a", title: "壳", content: "导语" });
    const b = createNode({ id: "b", title: "B", content: "正文B" });
    const c = createNode({ id: "c", title: "C" });
    a.children = [b, c];
    const { tree, selectId } = dissolveNode([a], "a");
    expect(tree.map((n) => n.id)).toEqual(["b", "c"]);
    expect(tree[0].content).toContain("导语");
    expect(tree[0].content).toContain("正文B");
    expect(selectId).toBe("b");
  });

  it("同级复制含子树且分配新 id", () => {
    const a = createNode({ id: "a", title: "A" });
    const b = createNode({ id: "b", title: "B" });
    const c = createNode({ id: "c", title: "C" });
    a.children = [b];
    b.children = [c];
    const tree = duplicateAsSibling([a], "a");
    expect(tree).toHaveLength(2);
    expect(tree[1].id).not.toBe("a");
    expect(tree[1].title).toBe("A");
    expect(tree[1].children[0].id).not.toBe("b");
    expect(tree[1].children[0].title).toBe("B");
    expect(tree[1].children[0].children[0].id).not.toBe("c");
    expect(tree[1].children[0].children[0].title).toBe("C");
  });
});
