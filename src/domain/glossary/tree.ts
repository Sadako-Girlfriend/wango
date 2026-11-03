/**
 * 词表树 CRUD / 移动（纯函数、不可变）。
 *
 * 边界（禁止耦合）：
 * - 不碰 React / TipTap / Tauri / 文件 IO。
 * - 不写审计日志、不扫链；日志与扫链分别在 match.ts / sessionStore。
 * - ref 只存 sourceNodeId；展示标题/正文由 resolve* 从大纲实时取，避免双份真相。
 */

import { t } from "@/i18n";
import type {
  GlossaryKind,
  GlossaryLocation,
  GlossaryNode,
  TreeNode,
} from "../types";
import { createId } from "../tree";

/** 新建词表节点；缺省 kind=local（词表内自建，与大纲无关） */
export function createGlossaryNode(
  partial?: Partial<GlossaryNode> & { kind?: GlossaryKind },
): GlossaryNode {
  return {
    id: partial?.id ?? createId(),
    kind: partial?.kind ?? "local",
    sourceNodeId: partial?.sourceNodeId,
    title: partial?.title ?? t("glossary.untitled"),
    content: partial?.content ?? "",
    children: partial?.children ?? [],
    aliases: partial?.aliases ? [...partial.aliases] : [],
    blacklist: partial?.blacklist ? [...partial.blacklist] : [],
    renameHistory: partial?.renameHistory
      ? partial.renameHistory.map((e) => ({ ...e }))
      : [],
    color: partial?.color,
  };
}

/**
 * 「引用为词条」：投影大纲节点。
 * 持久化只保留 sourceNodeId；title/content 快照仅作源节点被删时的兜底。
 */
export function createRefFromTreeNode(source: TreeNode): GlossaryNode {
  return createGlossaryNode({
    kind: "ref",
    sourceNodeId: source.id,
    title: source.title,
    content: source.content,
  });
}

/**
 * 「复制为词条」：深拷贝后脱钩。
 * 子节点一并拷入词表树；之后改大纲不会影响副本。
 */
export function createCopyFromTreeNode(source: TreeNode): GlossaryNode {
  const map = (n: TreeNode): GlossaryNode =>
    createGlossaryNode({
      kind: "copy",
      title: n.title,
      content: n.content,
      children: n.children.map(map),
    });
  return map(source);
}

export function findGlossaryById(
  tree: GlossaryNode[],
  id: string,
): GlossaryNode | null {
  for (const n of tree) {
    if (n.id === id) return n;
    const hit = findGlossaryById(n.children, id);
    if (hit) return hit;
  }
  return null;
}

export function findGlossaryLocation(
  tree: GlossaryNode[],
  id: string,
  parent: GlossaryNode | null = null,
  pathIds: string[] = [],
): GlossaryLocation | null {
  for (let i = 0; i < tree.length; i++) {
    const node = tree[i];
    const path = [...pathIds, node.id];
    if (node.id === id) {
      return { node, parent, index: i, pathIds: path };
    }
    const hit = findGlossaryLocation(node.children, id, node, path);
    if (hit) return hit;
  }
  return null;
}

/** 按大纲源 id 找第一个 ref 投影（用于「已引用则选中」） */
export function findGlossaryBySourceId(
  tree: GlossaryNode[],
  sourceNodeId: string,
): GlossaryNode | null {
  for (const n of tree) {
    if (n.kind === "ref" && n.sourceNodeId === sourceNodeId) return n;
    const hit = findGlossaryBySourceId(n.children, sourceNodeId);
    if (hit) return hit;
  }
  return null;
}

/** 收集指向某大纲节点的全部 ref（删除保护文案用） */
export function collectRefsToSource(
  tree: GlossaryNode[],
  sourceNodeId: string,
  out: GlossaryNode[] = [],
): GlossaryNode[] {
  for (const n of tree) {
    if (n.kind === "ref" && n.sourceNodeId === sourceNodeId) out.push(n);
    collectRefsToSource(n.children, sourceNodeId, out);
  }
  return out;
}

export function collectAllGlossaryIds(tree: GlossaryNode[]): string[] {
  const out: string[] = [];
  const walk = (list: GlossaryNode[]) => {
    for (const n of list) {
      out.push(n.id);
      walk(n.children);
    }
  };
  walk(tree);
  return out;
}

export function collectAncestorGlossaryIds(
  tree: GlossaryNode[],
  id: string,
): string[] {
  const loc = findGlossaryLocation(tree, id);
  if (!loc) return [];
  return loc.pathIds.slice(0, -1);
}

export function updateGlossaryNode(
  tree: GlossaryNode[],
  id: string,
  patch: Partial<
    Pick<
      GlossaryNode,
      | "title"
      | "content"
      | "kind"
      | "sourceNodeId"
      | "aliases"
      | "blacklist"
      | "renameHistory"
      | "color"
    >
  >,
): GlossaryNode[] {
  return tree.map((node) => {
    if (node.id === id) {
      const next: GlossaryNode = {
        ...node,
        ...patch,
        aliases: patch.aliases ? [...patch.aliases] : node.aliases,
        blacklist: patch.blacklist ? [...patch.blacklist] : node.blacklist,
        renameHistory: patch.renameHistory
          ? patch.renameHistory.map((e) => ({ ...e }))
          : node.renameHistory,
      };
      // 显式传 undefined → 清除自定义色，回到主题色
      if ("color" in patch && patch.color === undefined) {
        delete next.color;
      }
      return next;
    }
    return {
      ...node,
      children: updateGlossaryNode(node.children, id, patch),
    };
  });
}

export function addGlossaryChild(
  tree: GlossaryNode[],
  parentId: string | null,
  child: GlossaryNode = createGlossaryNode(),
): GlossaryNode[] {
  if (parentId === null) return [...tree, child];
  return tree.map((node) => {
    if (node.id === parentId) {
      return { ...node, children: [...node.children, child] };
    }
    return {
      ...node,
      children: addGlossaryChild(node.children, parentId, child),
    };
  });
}

export function removeGlossaryNode(
  tree: GlossaryNode[],
  id: string,
): GlossaryNode[] {
  return tree
    .filter((n) => n.id !== id)
    .map((n) => ({
      ...n,
      children: removeGlossaryNode(n.children, id),
    }));
}

function isGlossaryDescendant(
  tree: GlossaryNode[],
  ancestorId: string,
  maybeDescendantId: string,
): boolean {
  const anc = findGlossaryById(tree, ancestorId);
  if (!anc) return false;
  const walk = (n: GlossaryNode): boolean => {
    if (n.id === maybeDescendantId) return true;
    return n.children.some(walk);
  };
  return anc.children.some(walk);
}

function cloneGlossary(node: GlossaryNode): GlossaryNode {
  return {
    ...node,
    aliases: [...node.aliases],
    blacklist: [...node.blacklist],
    renameHistory: (node.renameHistory ?? []).map((e) => ({ ...e })),
    color: node.color,
    children: node.children.map(cloneGlossary),
  };
}

function updateChildrenOf(
  tree: GlossaryNode[],
  parentId: string,
  fn: (children: GlossaryNode[]) => GlossaryNode[],
): GlossaryNode[] {
  return tree.map((node) => {
    if (node.id === parentId) {
      return { ...node, children: fn(node.children) };
    }
    return {
      ...node,
      children: updateChildrenOf(node.children, parentId, fn),
    };
  });
}

function clampIndex(index: number, length: number): number {
  if (index < 0) return 0;
  if (index > length) return length;
  return index;
}

/** 拖拽落点：与大纲 moveNode 语义一致，禁止拖进自身子孙 */
export function moveGlossaryNode(
  tree: GlossaryNode[],
  id: string,
  targetParentId: string | null,
  targetIndex: number,
): GlossaryNode[] {
  if (id === targetParentId) return tree;
  if (targetParentId && isGlossaryDescendant(tree, id, targetParentId)) {
    return tree;
  }
  const loc = findGlossaryLocation(tree, id);
  if (!loc) return tree;
  const moved = cloneGlossary(loc.node);
  let next = removeGlossaryNode(tree, id);
  if (targetParentId === null) {
    const roots = [...next];
    roots.splice(clampIndex(targetIndex, roots.length), 0, moved);
    return roots;
  }
  if (!findGlossaryById(next, targetParentId)) return tree;
  return updateChildrenOf(next, targetParentId, (children) => {
    const copy = [...children];
    copy.splice(clampIndex(targetIndex, copy.length), 0, moved);
    return copy;
  });
}

/**
 * 删大纲源节点前调用：把仍指向它的 ref 物化为 local。
 * 这样「删除后正文仍保留在词条库」——词条不再依赖已删的大纲 id。
 */
export function materializeRefsToSource(
  glossary: GlossaryNode[],
  source: TreeNode,
): GlossaryNode[] {
  const walk = (list: GlossaryNode[]): GlossaryNode[] =>
    list.map((n) => {
      if (n.kind === "ref" && n.sourceNodeId === source.id) {
        return {
          ...n,
          kind: "local" as const,
          sourceNodeId: undefined,
          title: source.title,
          content: source.content,
          children: walk(n.children),
        };
      }
      return { ...n, children: walk(n.children) };
    });
  return walk(glossary);
}

/**
 * 展示标题：ref 跟大纲同步；源已删或非 ref 则用词条自带 title。
 * UI / 扫链都走这里，避免各自拼规则。
 */
export function resolveGlossaryTitle(
  entry: GlossaryNode,
  tree: TreeNode[],
): string {
  if (entry.kind === "ref" && entry.sourceNodeId) {
    const src = findTreeTitle(tree, entry.sourceNodeId);
    if (src != null) return src;
  }
  return entry.title;
}

function findTreeTitle(tree: TreeNode[], id: string): string | null {
  for (const n of tree) {
    if (n.id === id) return n.title;
    const hit = findTreeTitle(n.children, id);
    if (hit != null) return hit;
  }
  return null;
}

/** 展示/编辑正文：规则同 resolveGlossaryTitle */
export function resolveGlossaryContent(
  entry: GlossaryNode,
  tree: TreeNode[],
): string {
  if (entry.kind === "ref" && entry.sourceNodeId) {
    const src = findTreeContent(tree, entry.sourceNodeId);
    if (src != null) return src;
  }
  return entry.content;
}

function findTreeContent(tree: TreeNode[], id: string): string | null {
  for (const n of tree) {
    if (n.id === id) return n.content;
    const hit = findTreeContent(n.children, id);
    if (hit != null) return hit;
  }
  return null;
}
