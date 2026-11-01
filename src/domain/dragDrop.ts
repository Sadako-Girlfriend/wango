/**
 * 树拖拽落点计算：与 UI 解耦，只产出 moveNode 所需的 parentId / index。
 */

import type { TreeNode } from "./types";
import { findNodeById, findNodeLocation } from "./selection";
import { isDescendant } from "./tree";

/** 折叠后仍可见的扁平项 */
export interface FlatTreeItem {
  id: string;
  parentId: string | null;
  /** 在同级中的下标 */
  index: number;
  depth: number;
}

export type DropPlacement = "before" | "after" | "inside";

export interface MoveTarget {
  parentId: string | null;
  index: number;
}

/** 按当前折叠状态扁平化可见节点（深度优先） */
export function flattenVisible(
  tree: TreeNode[],
  collapsedIds: Record<string, true>,
  parentId: string | null = null,
  depth = 0,
): FlatTreeItem[] {
  const items: FlatTreeItem[] = [];
  tree.forEach((node, index) => {
    items.push({ id: node.id, parentId, index, depth });
    if (node.children.length > 0 && !collapsedIds[node.id]) {
      items.push(
        ...flattenVisible(node.children, collapsedIds, node.id, depth + 1),
      );
    }
  });
  return items;
}

/**
 * 根据相对节点与放置方式，计算 moveNode 参数。
 * 非法落点（拖到自己 / 子孙）返回 null。
 */
export function resolveDropTarget(
  tree: TreeNode[],
  draggedId: string,
  relativeToId: string,
  placement: DropPlacement,
): MoveTarget | null {
  if (draggedId === relativeToId) return null;
  // 不能拖进自己的子孙（含放到子孙前后）
  if (isDescendant(tree, draggedId, relativeToId)) return null;

  const dragLoc = findNodeLocation(tree, draggedId);
  const relLoc = findNodeLocation(tree, relativeToId);
  if (!dragLoc || !relLoc) return null;

  if (placement === "inside") {
    const target = findNodeById(tree, relativeToId);
    if (!target) return null;
    // 追加到末尾；若本就在该父下，moveNode 先删后插，length 会 clamp 到末尾
    return { parentId: relativeToId, index: target.children.length };
  }

  const parentId = relLoc.parent ? relLoc.parent.id : null;
  let index = placement === "before" ? relLoc.index : relLoc.index + 1;

  // 同父、从前往后拖：先删后插会导致目标下标左移一格
  const dragParentId = dragLoc.parent?.id ?? null;
  if (dragParentId === parentId && dragLoc.index < relLoc.index) {
    index -= 1;
  }

  return { parentId, index };
}

/**
 * 根据指针在行内的相对高度决定放置方式。
 * 上 1/4：前；下 1/4：后；中间：成为子节点。
 */
export function placementFromRatio(ratioY: number): DropPlacement {
  if (ratioY < 0.25) return "before";
  if (ratioY > 0.75) return "after";
  return "inside";
}
