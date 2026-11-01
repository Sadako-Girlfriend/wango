/**
 * 树操作 API：增删改、升降级、移动。
 * 全部不可变更新（返回新 tree），禁止在 UI 里手改 children。
 */

import { t } from "@/i18n";
import type {
  AttachmentMeta,
  NodePriority,
  ProjectData,
  TreeNode,
} from "./types";
import { findNodeById, findNodeLocation } from "./selection";

const PRIORITIES: NodePriority[] = ["high", "medium", "low"];
const MAX_LABELS = 20;
const MAX_LABEL_LEN = 32;

/** 生成节点 id（浏览器 / Node 均可） */
export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizePriority(value: unknown): NodePriority | null {
  if (typeof value !== "string") return null;
  return PRIORITIES.includes(value as NodePriority)
    ? (value as NodePriority)
    : null;
}

/** 去空白、去重、限长限个数 */
export function normalizeLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const s = item.trim().slice(0, MAX_LABEL_LEN);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= MAX_LABELS) break;
  }
  return out;
}

/** 创建空节点 */
export function createNode(partial?: Partial<TreeNode>): TreeNode {
  const priority = normalizePriority(partial?.priority);
  const labels = normalizeLabels(partial?.labels);
  return {
    id: partial?.id ?? createId(),
    title: partial?.title ?? t("editor.nodeUntitled"),
    content: partial?.content ?? "",
    children: partial?.children ?? [],
    attachments: partial?.attachments ?? [],
    ...(priority ? { priority } : {}),
    ...(labels.length ? { labels } : {}),
  };
}

/** 空项目 */
export function createEmptyProject(name?: string): ProjectData {
  const root = createNode({ title: t("editor.nodeUntitled") });
  return { name: name ?? t("project.untitled"), tree: [root] };
}

/** 保证有项目名；旧文件缺 name 时用根节点标题兜底 */
export function ensureProjectName(project: ProjectData): ProjectData {
  const trimmed = project.name?.trim();
  if (trimmed) return { ...project, name: trimmed };
  const fallback =
    project.tree[0]?.title?.trim() || t("project.untitled");
  return { ...project, name: fallback };
}

/** 深拷贝节点（含子孙） */
export function cloneNode(node: TreeNode): TreeNode {
  return {
    ...node,
    attachments: node.attachments.map((a) => ({ ...a })),
    children: node.children.map(cloneNode),
  };
}

/** 深拷贝并分配新 id（附件保留同一路径，元数据 id 更新） */
export function cloneNodeWithNewIds(node: TreeNode): TreeNode {
  const priority = normalizePriority(node.priority);
  const labels = normalizeLabels(node.labels);
  return {
    id: createId(),
    title: node.title,
    content: node.content,
    attachments: node.attachments.map((a) => ({ ...a, id: createId() })),
    children: node.children.map(cloneNodeWithNewIds),
    ...(priority ? { priority } : {}),
    ...(labels.length ? { labels } : {}),
  };
}

/** 同级复制：在目标后插入一份含子树的副本 */
export function duplicateAsSibling(tree: TreeNode[], id: string): TreeNode[] {
  const loc = findNodeLocation(tree, id);
  if (!loc) return tree;
  return addSiblingAfter(tree, id, cloneNodeWithNewIds(loc.node));
}

/** 更新指定节点的标题 / 正文 / 附件 / 优先级 / 标签等浅字段 */
export function updateNode(
  tree: TreeNode[],
  id: string,
  patch: Partial<
    Pick<TreeNode, "title" | "content" | "attachments" | "priority" | "labels">
  >,
): TreeNode[] {
  return tree.map((node) => {
    if (node.id === id) {
      const next: TreeNode = { ...node, ...patch };
      if ("priority" in patch) {
        const p = normalizePriority(patch.priority);
        if (p) next.priority = p;
        else delete next.priority;
      }
      if ("labels" in patch) {
        const labels = normalizeLabels(patch.labels);
        if (labels.length) next.labels = labels;
        else delete next.labels;
      }
      return next;
    }
    return { ...node, children: updateNode(node.children, id, patch) };
  });
}

/** 在父节点下追加子节点；parentId 为 null 则追加到根级 */
export function addChild(
  tree: TreeNode[],
  parentId: string | null,
  child: TreeNode = createNode(),
): TreeNode[] {
  if (parentId === null) {
    return [...tree, child];
  }
  return tree.map((node) => {
    if (node.id === parentId) {
      return { ...node, children: [...node.children, child] };
    }
    return { ...node, children: addChild(node.children, parentId, child) };
  });
}

/** 在某节点后插入同级兄弟 */
export function addSiblingAfter(
  tree: TreeNode[],
  afterId: string,
  sibling: TreeNode = createNode(),
): TreeNode[] {
  const loc = findNodeLocation(tree, afterId);
  if (!loc) return tree;

  if (!loc.parent) {
    const next = [...tree];
    next.splice(loc.index + 1, 0, sibling);
    return next;
  }

  return updateChildrenOf(tree, loc.parent.id, (children) => {
    const next = [...children];
    next.splice(loc.index + 1, 0, sibling);
    return next;
  });
}

/** 删除节点（含子树） */
export function removeNode(tree: TreeNode[], id: string): TreeNode[] {
  return tree
    .filter((node) => node.id !== id)
    .map((node) => ({ ...node, children: removeNode(node.children, id) }));
}

/**
 * 升级：节点变成原父级的同级（插到父级后面）。
 * 根节点无法再升级。
 */
export function promoteNode(tree: TreeNode[], id: string): TreeNode[] {
  const loc = findNodeLocation(tree, id);
  if (!loc || !loc.parent) return tree;

  const parentLoc = findNodeLocation(tree, loc.parent.id);
  if (!parentLoc) return tree;

  const lifted = cloneNode(loc.node);
  let next = removeNode(tree, id);

  if (!parentLoc.parent) {
    const roots = [...next];
    const pIndex = roots.findIndex((n) => n.id === parentLoc.node.id);
    roots.splice(pIndex + 1, 0, lifted);
    return roots;
  }

  return updateChildrenOf(next, parentLoc.parent.id, (children) => {
    const idx = children.findIndex((n) => n.id === parentLoc.node.id);
    const copy = [...children];
    copy.splice(idx + 1, 0, lifted);
    return copy;
  });
}

/**
 * 降级：节点成为前一个同级兄弟的最后一个子节点。
 * 没有前一个兄弟则无法降级。
 */
export function demoteNode(tree: TreeNode[], id: string): TreeNode[] {
  const loc = findNodeLocation(tree, id);
  if (!loc || loc.index === 0) return tree;

  const siblings = loc.parent ? loc.parent.children : tree;
  const prev = siblings[loc.index - 1];
  const moved = cloneNode(loc.node);
  let next = removeNode(tree, id);
  return addChild(next, prev.id, moved);
}

/**
 * 将节点移动到目标父级下的指定下标。
 * targetParentId 为 null 表示根级；不能移到自己的子孙下。
 */
export function moveNode(
  tree: TreeNode[],
  id: string,
  targetParentId: string | null,
  targetIndex: number,
): TreeNode[] {
  if (id === targetParentId) return tree;
  if (targetParentId && isDescendant(tree, id, targetParentId)) return tree;

  const loc = findNodeLocation(tree, id);
  if (!loc) return tree;

  const moved = cloneNode(loc.node);
  let next = removeNode(tree, id);

  if (targetParentId === null) {
    const roots = [...next];
    const clamped = clampIndex(targetIndex, roots.length);
    roots.splice(clamped, 0, moved);
    return roots;
  }

  if (!findNodeById(next, targetParentId)) return tree;

  return updateChildrenOf(next, targetParentId, (children) => {
    const copy = [...children];
    const clamped = clampIndex(targetIndex, copy.length);
    copy.splice(clamped, 0, moved);
    return copy;
  });
}

/** 判断 maybeDescendantId 是否位于 ancestorId 子树内（不含自身） */
export function isDescendant(
  tree: TreeNode[],
  ancestorId: string,
  maybeDescendantId: string,
): boolean {
  const ancestor = findNodeById(tree, ancestorId);
  if (!ancestor) return false;
  return Boolean(findNodeById(ancestor.children, maybeDescendantId));
}

function updateChildrenOf(
  tree: TreeNode[],
  parentId: string,
  updater: (children: TreeNode[]) => TreeNode[],
): TreeNode[] {
  return tree.map((node) => {
    if (node.id === parentId) {
      return { ...node, children: updater(node.children) };
    }
    return {
      ...node,
      children: updateChildrenOf(node.children, parentId, updater),
    };
  });
}

function clampIndex(index: number, length: number): number {
  if (index < 0) return 0;
  if (index > length) return length;
  return index;
}

/** 给节点追加附件元数据 */
export function addAttachment(
  tree: TreeNode[],
  nodeId: string,
  attachment: AttachmentMeta,
): TreeNode[] {
  const node = findNodeById(tree, nodeId);
  if (!node) return tree;
  return updateNode(tree, nodeId, {
    attachments: [...node.attachments, attachment],
  });
}

/** 移除附件元数据（不负责删磁盘文件，由 io 层处理） */
export function removeAttachment(
  tree: TreeNode[],
  nodeId: string,
  attachmentId: string,
): TreeNode[] {
  const node = findNodeById(tree, nodeId);
  if (!node) return tree;
  return updateNode(tree, nodeId, {
    attachments: node.attachments.filter((a) => a.id !== attachmentId),
  });
}
