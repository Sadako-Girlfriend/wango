/**
 * 多项目会话：选项卡列表 + 当前 tab + 历史。
 * 打开/模板只 addTab，禁止替换已有 tab 内容。
 */

import { create } from "zustand";
import {
  addAttachment,
  addChild,
  addSiblingAfter,
  cloneNode,
  cloneNodeWithNewIds,
  createId,
  createNode,
  demoteNode,
  ensureProjectName,
  findNodeById,
  findNodeLocation,
  moveNode,
  promoteNode,
  removeAttachment,
  removeNode,
  updateNode,
  type AttachmentMeta,
  type NodePriority,
  type ProjectData,
  type TreeNode,
} from "@/domain";
import type { RecentEntry } from "@/desktop/sessionPersist";
import { t } from "@/i18n";

export interface ProjectTab {
  id: string;
  project: ProjectData;
  selectedId: string | null;
  collapsedIds: Record<string, true>;
  searchQuery: string;
  filePath: string | null;
  /** 内容修订号 */
  revision: number;
  /** 已成功写入草稿/文件的修订号 */
  syncedRevision: number;
  /** 是否编辑过（未绑路径关闭时要提示） */
  touched: boolean;
}

export type HomeMode = "templates" | "history";

interface SessionState {
  hydrated: boolean;
  hasLaunchedBefore: boolean;
  homeMode: HomeMode;
  tabs: ProjectTab[];
  activeTabId: string | null;
  recents: RecentEntry[];
  /** 自动保存失败提示 */
  saveError: string | null;
  /** 树节点剪贴板（复制用，含子树快照） */
  treeClipboard: TreeNode | null;

  hydrateFromPersist: (payload: {
    hasLaunchedBefore: boolean;
    activeTabId: string | null;
    tabs: ProjectTab[];
    recents: RecentEntry[];
  }) => void;
  markLaunched: () => void;

  getActiveTab: () => ProjectTab | null;
  selectTab: (id: string) => void;
  /** 新建 tab 并激活；同 filePath 已打开则只切换 */
  openProjectTab: (input: {
    project: ProjectData;
    filePath?: string | null;
    titleHint?: string;
  }) => string;
  /** 请求关闭前由 UI 判断脏状态；此处执行真正移除 */
  removeTab: (id: string) => void;
  touchRecent: (tab: ProjectTab) => void;
  /** 从最近列表移除一条（不关已打开的 tab） */
  removeRecent: (key: string) => void;

  selectNode: (id: string | null) => void;
  toggleCollapsed: (id: string) => void;
  /** 从 collapsedIds 去掉这些 id，用于搜索定位时展开祖先 */
  expandNodes: (ids: string[]) => void;
  setSearchQuery: (q: string) => void;
  setProjectName: (name: string) => void;
  /** 按 tab id 改名（双击选项卡时用） */
  renameTabProject: (tabId: string, name: string) => void;
  setTitle: (id: string, title: string) => void;
  setContent: (id: string, content: string) => void;
  setNodePriority: (id: string, priority: NodePriority | null) => void;
  setNodeLabels: (id: string, labels: string[]) => void;
  /** 灵感流式：指定 tab 追加正文 */
  appendContentOnTab: (tabId: string, nodeId: string, text: string) => void;
  /** 灵感流式：指定 tab 插入节点并可选选中 */
  addInspireNode: (
    tabId: string,
    input: { node: TreeNode; parentId: string | null; select?: boolean },
  ) => void;
  selectNodeOnTab: (tabId: string, nodeId: string | null) => void;
  addChildNode: (parentId: string | null) => void;
  addSiblingNode: (afterId: string) => void;
  /** 同级复制节点及其子树（立即插入） */
  duplicateNode: (id: string) => void;
  /** 复制到树剪贴板（含子树） */
  copyTreeNode: (id: string) => void;
  /** 从剪贴板粘贴为同级（插在 afterId 后；无 afterId 则追加根级） */
  pasteTreeNode: (afterId: string | null) => void;
  deleteNode: (id: string) => void;
  promote: (id: string) => void;
  demote: (id: string) => void;
  move: (id: string, parentId: string | null, index: number) => void;
  attachMetas: (nodeId: string, metas: AttachmentMeta[]) => void;
  detachAttachment: (
    nodeId: string,
    attachmentId: string,
  ) => AttachmentMeta | null;

  setFilePath: (tabId: string, path: string) => void;
  markSynced: (tabId: string, revision: number) => void;
  setSaveError: (msg: string | null) => void;
}

function firstId(tree: { tree: TreeNode[] } | TreeNode[]): string | null {
  const list = Array.isArray(tree) ? tree : tree.tree;
  return list[0]?.id ?? null;
}

export function displayTabTitle(tab: ProjectTab): string {
  const name = tab.project.name?.trim();
  if (name) return name;
  return tab.project.tree[0]?.title?.trim() || t("project.untitled");
}

/** 关 tab 是否需要提示 */
export function tabNeedsCloseConfirm(tab: ProjectTab): boolean {
  if (!tab.filePath) return tab.touched || tab.revision > 0;
  return tab.revision > tab.syncedRevision;
}

function patchActive(
  state: SessionState,
  patch: (tab: ProjectTab) => ProjectTab,
): Partial<SessionState> {
  const id = state.activeTabId;
  if (!id) return {};
  return {
    tabs: state.tabs.map((t) => (t.id === id ? patch(t) : t)),
  };
}

function patchTabById(
  state: SessionState,
  tabId: string,
  patch: (tab: ProjectTab) => ProjectTab,
): Partial<SessionState> {
  if (!state.tabs.some((t) => t.id === tabId)) return {};
  return {
    tabs: state.tabs.map((t) => (t.id === tabId ? patch(t) : t)),
  };
}

function bump(tab: ProjectTab, project: ProjectData): ProjectTab {
  return {
    ...tab,
    project,
    revision: tab.revision + 1,
    touched: true,
  };
}

const MAX_RECENTS = 30;

export const useSessionStore = create<SessionState>((set, get) => ({
  hydrated: false,
  hasLaunchedBefore: false,
  homeMode: "templates",
  tabs: [],
  activeTabId: null,
  recents: [],
  saveError: null,
  treeClipboard: null,

  hydrateFromPersist: ({ hasLaunchedBefore, activeTabId, tabs, recents }) => {
    const active =
      tabs.find((t) => t.id === activeTabId)?.id ?? tabs[0]?.id ?? null;
    set({
      hydrated: true,
      hasLaunchedBefore,
      homeMode: hasLaunchedBefore ? "history" : "templates",
      tabs,
      activeTabId: active,
      // 清掉历史里未另存草稿项
      recents: recents.filter((r) => Boolean(r.filePath)),
    });
  },

  markLaunched: () => set({ hasLaunchedBefore: true }),

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId) ?? null;
  },

  selectTab: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    set({ activeTabId: id });
    get().touchRecent(tab);
  },

  openProjectTab: ({ project, filePath = null }) => {
    const pathNorm = filePath?.replace(/\\/g, "/") ?? null;
    if (pathNorm) {
      const existing = get().tabs.find(
        (t) => t.filePath?.replace(/\\/g, "/") === pathNorm,
      );
      if (existing) {
        set({ activeTabId: existing.id });
        get().touchRecent(existing);
        return existing.id;
      }
    }

    const normalized = ensureProjectName(project);
    const id = createId();
    const tab: ProjectTab = {
      id,
      project: normalized,
      selectedId: firstId(normalized.tree),
      collapsedIds: {},
      searchQuery: "",
      filePath: filePath ?? null,
      revision: 0,
      syncedRevision: 0,
      touched: false,
    };
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: id,
      hasLaunchedBefore: true,
      homeMode: "history",
    }));
    get().touchRecent(tab);
    return id;
  },

  removeTab: (id) => {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      if (idx < 0) return s;
      const tabs = s.tabs.filter((t) => t.id !== id);
      let activeTabId = s.activeTabId;
      if (activeTabId === id) {
        const neighbor = tabs[idx] ?? tabs[idx - 1] ?? null;
        activeTabId = neighbor?.id ?? null;
      }
      return {
        tabs,
        activeTabId,
        homeMode: tabs.length === 0 ? "history" : s.homeMode,
      };
    });
  },

  touchRecent: (tab) => {
    // 未另存草稿不进最近列表（避免「其他项目」被临时标签占满）
    if (!tab.filePath) return;
    const key = tab.filePath;
    const entry: RecentEntry = {
      key,
      title: displayTabTitle(tab),
      filePath: tab.filePath,
      draftTabId: null,
      lastOpenedAt: Date.now(),
    };
    set((s) => {
      const rest = s.recents.filter(
        (r) => r.key !== key && Boolean(r.filePath),
      );
      return { recents: [entry, ...rest].slice(0, MAX_RECENTS) };
    });
  },

  removeRecent: (key) => {
    set((s) => ({
      recents: s.recents.filter((r) => r.key !== key),
    }));
  },

  selectNode: (id) =>
    set((s) => patchActive(s, (t) => ({ ...t, selectedId: id }))),

  toggleCollapsed: (id) =>
    set((s) =>
      patchActive(s, (t) => {
        const next = { ...t.collapsedIds };
        if (next[id]) delete next[id];
        else next[id] = true;
        return { ...t, collapsedIds: next };
      }),
    ),

  expandNodes: (ids) =>
    set((s) =>
      patchActive(s, (t) => {
        if (!ids.length) return t;
        const next = { ...t.collapsedIds };
        let changed = false;
        for (const id of ids) {
          if (next[id]) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? { ...t, collapsedIds: next } : t;
      }),
    ),

  setSearchQuery: (q) =>
    set((s) => patchActive(s, (t) => ({ ...t, searchQuery: q }))),

  setProjectName: (name) => {
    const id = get().activeTabId;
    if (id) get().renameTabProject(id, name);
  },

  renameTabProject: (tabId, name) => {
    const cleaned = name.trim() || t("project.untitled");
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        return bump(t, { ...t.project, name: cleaned });
      }),
    }));
    const tab = get().tabs.find((t) => t.id === tabId);
    if (tab) get().touchRecent(tab);
  },

  setTitle: (id, title) =>
    set((s) =>
      patchActive(s, (t) =>
        bump(t, {
          ...t.project,
          tree: updateNode(t.project.tree, id, { title }),
        }),
      ),
    ),

  setContent: (id, content) =>
    set((s) =>
      patchActive(s, (t) =>
        bump(t, {
          ...t.project,
          tree: updateNode(t.project.tree, id, { content }),
        }),
      ),
    ),

  setNodePriority: (id, priority) =>
    set((s) =>
      patchActive(s, (t) =>
        bump(t, {
          ...t.project,
          tree: updateNode(t.project.tree, id, { priority }),
        }),
      ),
    ),

  setNodeLabels: (id, labels) =>
    set((s) =>
      patchActive(s, (t) =>
        bump(t, {
          ...t.project,
          tree: updateNode(t.project.tree, id, { labels }),
        }),
      ),
    ),

  appendContentOnTab: (tabId, nodeId, text) => {
    if (!text) return;
    set((s) =>
      patchTabById(s, tabId, (t) => {
        const node = findNodeById(t.project.tree, nodeId);
        if (!node) return t;
        return bump(t, {
          ...t.project,
          tree: updateNode(t.project.tree, nodeId, {
            content: node.content + text,
          }),
        });
      }),
    );
  },

  addInspireNode: (tabId, { node, parentId, select }) =>
    set((s) =>
      patchTabById(s, tabId, (t) => {
        const parentOk =
          parentId === null || Boolean(findNodeById(t.project.tree, parentId));
        const tree = addChild(
          t.project.tree,
          parentOk ? parentId : null,
          node,
        );
        return {
          ...bump(t, { ...t.project, tree }),
          selectedId: select ? node.id : t.selectedId,
        };
      }),
    ),

  selectNodeOnTab: (tabId, nodeId) =>
    set((s) =>
      patchTabById(s, tabId, (t) =>
        t.selectedId === nodeId ? t : { ...t, selectedId: nodeId },
      ),
    ),

  addChildNode: (parentId) => {
    const child = createNode();
    set((s) =>
      patchActive(s, (t) => ({
        ...bump(t, {
          ...t.project,
          tree: addChild(t.project.tree, parentId, child),
        }),
        selectedId: child.id,
      })),
    );
  },

  addSiblingNode: (afterId) => {
    const sibling = createNode();
    set((s) =>
      patchActive(s, (t) => ({
        ...bump(t, {
          ...t.project,
          tree: addSiblingAfter(t.project.tree, afterId, sibling),
        }),
        selectedId: sibling.id,
      })),
    );
  },

  duplicateNode: (id) => {
    set((s) =>
      patchActive(s, (t) => {
        const loc = findNodeLocation(t.project.tree, id);
        if (!loc) return t;
        const copy = cloneNodeWithNewIds(loc.node);
        return {
          ...bump(t, {
            ...t.project,
            tree: addSiblingAfter(t.project.tree, id, copy),
          }),
          selectedId: copy.id,
        };
      }),
    );
  },

  copyTreeNode: (id) => {
    const tab = get().getActiveTab();
    if (!tab) return;
    const node = findNodeById(tab.project.tree, id);
    if (!node) return;
    set({ treeClipboard: cloneNode(node) });
  },

  pasteTreeNode: (afterId) => {
    const clip = get().treeClipboard;
    if (!clip) return;
    const copy = cloneNodeWithNewIds(clip);
    set((s) =>
      patchActive(s, (t) => {
        let tree = t.project.tree;
        if (afterId && findNodeById(tree, afterId)) {
          tree = addSiblingAfter(tree, afterId, copy);
        } else {
          tree = [...tree, copy];
        }
        return {
          ...bump(t, { ...t.project, tree }),
          selectedId: copy.id,
        };
      }),
    );
  },

  deleteNode: (id) =>
    set((s) =>
      patchActive(s, (t) => {
        const tree = removeNode(t.project.tree, id);
        const selectedId =
          t.selectedId === id ? firstId(tree) : t.selectedId;
        return { ...bump(t, { ...t.project, tree }), selectedId };
      }),
    ),

  promote: (id) =>
    set((s) =>
      patchActive(s, (t) =>
        bump(t, {
          ...t.project,
          tree: promoteNode(t.project.tree, id),
        }),
      ),
    ),

  demote: (id) =>
    set((s) =>
      patchActive(s, (t) =>
        bump(t, {
          ...t.project,
          tree: demoteNode(t.project.tree, id),
        }),
      ),
    ),

  move: (id, parentId, index) =>
    set((s) =>
      patchActive(s, (t) =>
        bump(t, {
          ...t.project,
          tree: moveNode(t.project.tree, id, parentId, index),
        }),
      ),
    ),

  attachMetas: (nodeId, metas) =>
    set((s) =>
      patchActive(s, (t) => {
        let tree = t.project.tree;
        for (const meta of metas) {
          tree = addAttachment(tree, nodeId, meta);
        }
        return bump(t, { ...t.project, tree });
      }),
    ),

  detachAttachment: (nodeId, attachmentId) => {
    const tab = get().getActiveTab();
    if (!tab) return null;
    const node = findNodeById(tab.project.tree, nodeId);
    const meta = node?.attachments.find((a) => a.id === attachmentId) ?? null;
    if (!meta) return null;
    set((s) =>
      patchActive(s, (t) =>
        bump(t, {
          ...t.project,
          tree: removeAttachment(t.project.tree, nodeId, attachmentId),
        }),
      ),
    );
    return meta;
  },

  setFilePath: (tabId, path) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, filePath: path } : t,
      ),
    })),

  markSynced: (tabId, revision) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, syncedRevision: revision } : t,
      ),
    })),

  setSaveError: (msg) => set({ saveError: msg }),
}));

export function getSelectedNodeFromSession(): TreeNode | null {
  const tab = useSessionStore.getState().getActiveTab();
  if (!tab?.selectedId) return null;
  return findNodeById(tab.project.tree, tab.selectedId);
}
