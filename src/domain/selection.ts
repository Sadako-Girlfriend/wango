/**
 * 树查找与选中辅助：纯函数，不持有状态。
 */

import type { NodeLocation, TreeNode } from "./types";

/** 按 id 查找节点及父级、同级下标 */
export function findNodeLocation(
  tree: TreeNode[],
  id: string,
  parent: TreeNode | null = null,
  pathIds: string[] = [],
): NodeLocation | null {
  for (let index = 0; index < tree.length; index += 1) {
    const node = tree[index];
    const nextPath = [...pathIds, node.id];
    if (node.id === id) {
      return { node, parent, index, pathIds: nextPath };
    }
    const nested = findNodeLocation(node.children, id, node, nextPath);
    if (nested) return nested;
  }
  return null;
}

/** 按 id 取节点引用（仍属原树，勿直接变异；应用 tree API 改） */
export function findNodeById(tree: TreeNode[], id: string): TreeNode | null {
  return findNodeLocation(tree, id)?.node ?? null;
}

/** 深度优先收集全部节点 id */
export function collectAllIds(tree: TreeNode[]): string[] {
  const ids: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      ids.push(node.id);
      walk(node.children);
    }
  };
  walk(tree);
  return ids;
}

/**
 * 标题关键字过滤：命中节点及其祖先保留，形成可展示子树。
 * @deprecated 树搜索已改为定位高亮；保留供兼容，新代码用 collectTitleMatches。
 */
export function filterTreeByTitle(tree: TreeNode[], keyword: string): TreeNode[] {
  const q = keyword.trim().toLowerCase();
  if (!q) return tree.map(cloneShallow);

  const filterNodes = (nodes: TreeNode[]): TreeNode[] => {
    const result: TreeNode[] = [];
    for (const node of nodes) {
      const children = filterNodes(node.children);
      const selfHit = node.title.toLowerCase().includes(q);
      if (selfHit || children.length > 0) {
        result.push({ ...node, children });
      }
    }
    return result;
  };

  return filterNodes(tree);
}

/** 深度优先收集标题包含关键字的节点 id（定位高亮用） */
export function collectTitleMatches(
  tree: TreeNode[],
  keyword: string,
): string[] {
  const q = keyword.trim().toLowerCase();
  if (!q) return [];
  const ids: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.title.toLowerCase().includes(q)) ids.push(node.id);
      walk(node.children);
    }
  };
  walk(tree);
  return ids;
}

/** 展开命中节点所需的祖先 id（不含节点自身） */
export function collectAncestorIds(
  tree: TreeNode[],
  nodeIds: string[],
): string[] {
  const set = new Set<string>();
  for (const id of nodeIds) {
    const loc = findNodeLocation(tree, id);
    if (!loc) continue;
    for (let i = 0; i < loc.pathIds.length - 1; i += 1) {
      set.add(loc.pathIds[i]);
    }
  }
  return [...set];
}

function cloneShallow(node: TreeNode): TreeNode {
  return {
    ...node,
    children: node.children.map(cloneShallow),
    attachments: [...node.attachments],
  };
}
