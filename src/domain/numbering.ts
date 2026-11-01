/**
 * 节点编号引擎：根据树位置派生 1 / 1.1 / 1.1.1。
 * 纯函数，不改原树；结果仅供 UI 展示。
 */

import type { NumberedTreeNode, TreeNode } from "./types";

/** 为整棵树附加展示用编号（从 1 起） */
export function withNumbering(tree: TreeNode[]): NumberedTreeNode[] {
  return tree.map((node, index) => annotate(node, String(index + 1)));
}

/**
 * 以指定根号给单棵子树编号（保留源序号时用）。
 * 例：rootNumber="2.3" → 根 2.3，子 2.3.1 / 2.3.2…
 */
export function withNumberingFrom(
  root: TreeNode,
  rootNumber: string,
): NumberedTreeNode {
  return annotate(root, rootNumber);
}

function annotate(node: TreeNode, number: string): NumberedTreeNode {
  return {
    ...node,
    number,
    children: node.children.map((child, index) =>
      annotate(child, `${number}.${index + 1}`),
    ),
  };
}

/** 根据节点 id 查找其展示编号；找不到返回 null */
export function getNumberById(tree: TreeNode[], id: string): string | null {
  const numbered = withNumbering(tree);
  return findNumber(numbered, id);
}

function findNumber(nodes: NumberedTreeNode[], id: string): string | null {
  for (const node of nodes) {
    if (node.id === id) return node.number;
    const nested = findNumber(node.children, id);
    if (nested) return nested;
  }
  return null;
}
