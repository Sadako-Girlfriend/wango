/**
 * 多项目会话：选项卡列表 + 当前 tab + 历史。
 * 打开/模板只 addTab，禁止替换已有 tab 内容。
 *
 * 词表相关约定：
 * - 树算法 / 扫链 / 物化在 domain；本 store 只编排「读 project → 调纯函数 → bump」。
 * - UI（GlossaryPane / LogPanel / Decorations）不得直接改 project 字段。
 */

import { create } from "zustand";
import {
  addAttachment,
  addChild,
  addGlossaryChild,
  addSiblingAfter,
  cloneNode,
  cloneNodeWithNewIds,
  collectRefsToSource,
  countActiveLinks,
  createCopyFromTreeNode,
  createGlossaryNode,
  createId,
  createManualLink,
  createNode,
  createRefFromTreeNode,
  locateAnchorInHost,
  occurrenceIndexBefore,
  isAutoLink,
  demoteNode,
  dissolveNode as dissolveTreeNode,
  ensureProjectName,
  findGlossaryById,
  findGlossaryBySourceId,
  findNodeById,
  findNodeLocation,
  materializeRefsToSource,
  moveGlossaryNode,
  moveNode,
  moveSibling as moveSiblingInTree,
  promoteNode,
  releaseChildren as releaseTreeChildren,
  removeAttachment,
  removeGlossaryNode,
  removeNode,
  replaceRanges,
  resolveGlossaryContent,
  resolveGlossaryTitle,
  scanProjectLinks,
  snippetAround,
  updateGlossaryNode,
  updateNode,
  type AttachmentMeta,
  type GlossaryLink,
  type GlossaryLog,
  type GlossaryNode,
  type NodePriority,
  type ProjectData,
  type TreeNode,
} from "@/domain";
import type { RecentEntry } from "@/desktop/sessionPersist";
import { t } from "@/i18n";

export type SelectionScope = "tree" | "glossary";

/** 工作区「已打开」页（仅当前项目内） */
export type OpenedPage = {
  scope: SelectionScope;
  id: string;
};

const MAX_OPENED_PAGES = 8;

export interface ProjectTab {
  id: string;
  project: ProjectData;
  selectedId: string | null;
  /** 当前编辑作用域：大纲或词表（copy/local） */
  selectionScope: SelectionScope;
  /** 词表高亮 / copy·local 选中 */
  glossarySelectedId: string | null;
  /** 工作区最近打开的页，用于顶栏切换（顺序稳定：新开追加末尾，点击不挪位） */
  openedPages: OpenedPage[];
  /** 自上次同步后改过正文/标题的已打开页 */
  openedDirty: Record<string, true>;
  collapsedIds: Record<string, true>;
  glossaryCollapsedIds: Record<string, true>;
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
  /** 选中词表项：ref 跳到大纲源；copy/local 编词表正文 */
  selectGlossary: (id: string | null) => void;
  /** 激活「已打开」页 */
  openWorkspacePage: (page: OpenedPage) => void;
  /** 关掉「已打开」页（不删内容） */
  closeOpenedPage: (page: OpenedPage) => void;
  /** 关掉除指定页外的其它已打开页 */
  closeOtherOpenedPages: (keep: OpenedPage) => void;
  /** 关掉全部已打开页并清空当前编辑 */
  closeAllOpenedPages: () => void;
  toggleCollapsed: (id: string) => void;
  toggleGlossaryCollapsed: (id: string) => void;
  /** 从 collapsedIds 去掉这些 id，用于搜索定位时展开祖先 */
  expandNodes: (ids: string[]) => void;
  expandGlossaryNodes: (ids: string[]) => void;
  setSearchQuery: (q: string) => void;
  setProjectName: (name: string) => void;
  /** 按 tab id 改名（双击选项卡时用） */
  renameTabProject: (tabId: string, name: string) => void;
  setTitle: (id: string, title: string) => void;
  setContent: (id: string, content: string) => void;
  /** 词表 copy/local 标题 */
  setGlossaryTitle: (id: string, title: string) => void;
  setGlossaryContent: (id: string, content: string) => void;
  /** 引用大纲节点为词条；已存在则选中 */
  referenceAsGlossary: (treeNodeId: string) => string | null;
  /** 复制大纲节点为独立词条 */
  copyAsGlossary: (treeNodeId: string) => string | null;
  addGlossaryChildNode: (parentId: string | null) => void;
  deleteGlossaryEntry: (id: string) => void;
  moveGlossary: (id: string, parentId: string | null, index: number) => void;
  setGlossaryBlacklist: (id: string, blacklist: string[]) => void;
  /** 保存词条别名整表（不含标题本身） */
  setGlossaryAliases: (id: string, aliases: string[]) => void;
  /** 词条引用色；传 null/undefined 恢复主题色 */
  setGlossaryColor: (id: string, color: string | null) => void;
  /** 疑似提及一键确认为手动绑定（高亮） */
  confirmGlossaryAutoLink: (linkId: string) => void;
  /** 静默扫链，合并 links/logs */
  rescanGlossaryLinks: () => void;
  /** 手动移除一处引用（解绑） */
  removeGlossaryLink: (linkId: string) => void;
  /**
   * 正文选区手动绑定到一个或多个词条（可多绑 / 二次加绑）。
   * occurrenceIndex：锚文字在宿主 Markdown 中的第几次出现（0-based）。
   */
  bindGlossaryManual: (input: {
    hostNodeId: string;
    text: string;
    occurrenceIndex: number;
    entryIds: string[];
  }) => void;
  /**
   * 在指定父词条下新建子词条（local）；title/content 可来自选区。
   * parentId=null 时建根级。返回新词条 id。
   */
  addGlossaryChildWithContent: (
    parentId: string | null,
    title: string,
    content?: string,
  ) => string | null;
  /** 从日志恢复引用 */
  restoreGlossaryLink: (linkId: string) => void;
  /** 取消黑名单拦截：从 blacklist 去掉短语并恢复 link */
  clearBlacklistBlock: (linkId: string) => void;
  /** 改名：只改标题，旧称进 aliases；不同步正文 */
  renameGlossaryTerm: (entryId: string, newTitle: string) => void;
  /** 撤销单条修改审查日志 */
  undoGlossaryEditLog: (logId: string) => void;
  appendGlossaryLog: (log: GlossaryLog) => void;
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
  /** Agent 等：带标题/正文新建子节点；失败返回 null */
  addChildNodeWithContent: (
    parentId: string,
    title: string,
    content?: string,
  ) => string | null;
  addSiblingNode: (afterId: string) => void;
  /** 同级复制节点及其子树（立即插入） */
  duplicateNode: (id: string) => void;
  /** 复制到树剪贴板（含子树） */
  copyTreeNode: (id: string) => void;
  /** 从剪贴板粘贴为同级（插在 afterId 后；无 afterId 则追加根级） */
  pasteTreeNode: (afterId: string | null) => void;
  /**
   * 挂载导入子树：有 parentId 且存在 → 作为其子节点追加；否则根级追加。
   * 选中导入的第一个根节点。
   */
  importSubtree: (parentId: string | null, nodes: TreeNode | TreeNode[]) => void;
  deleteNode: (id: string) => void;
  promote: (id: string) => void;
  demote: (id: string) => void;
  /** 释放子节点：孩子升为同级，父保留 */
  releaseChildren: (id: string) => void;
  /** 解散节点：孩子顶替父位置，父移除 */
  dissolveNode: (id: string) => void;
  move: (id: string, parentId: string | null, index: number) => void;
  /** 同级上下移 */
  moveSibling: (id: string, dir: -1 | 1) => void;
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

export function openedPageKey(page: OpenedPage): string {
  return `${page.scope}:${page.id}`;
}

function sameOpenedPage(a: OpenedPage, b: OpenedPage): boolean {
  return a.scope === b.scope && a.id === b.id;
}

/** 已存在则保持原位；否则追加到末尾（超限丢掉最旧的非当前页） */
function ensureOpenedPage(
  pages: OpenedPage[] | undefined,
  page: OpenedPage,
): OpenedPage[] {
  const list = pages ?? [];
  if (list.some((p) => sameOpenedPage(p, page))) return list;
  const next = [...list, page];
  while (next.length > MAX_OPENED_PAGES) {
    const dropIdx = next.findIndex((p) => !sameOpenedPage(p, page));
    if (dropIdx < 0) break;
    next.splice(dropIdx, 1);
  }
  return next;
}

function withPageDirty(tab: ProjectTab, page: OpenedPage): ProjectTab {
  const key = openedPageKey(page);
  if (tab.openedDirty?.[key]) return tab;
  return {
    ...tab,
    openedDirty: { ...(tab.openedDirty ?? {}), [key]: true },
  };
}

function pruneOpenedPages(tab: ProjectTab): OpenedPage[] {
  return (tab.openedPages ?? []).filter((p) => {
    if (p.scope === "tree") {
      return Boolean(findNodeById(tab.project.tree, p.id));
    }
    const entry = findGlossaryById(tab.project.glossary, p.id);
    return Boolean(entry && entry.kind !== "ref");
  });
}

function openTreePage(tab: ProjectTab, id: string): Partial<ProjectTab> {
  return {
    selectedId: id,
    selectionScope: "tree" as const,
    openedPages: ensureOpenedPage(tab.openedPages, { scope: "tree", id }),
  };
}

function openGlossaryPage(tab: ProjectTab, id: string): Partial<ProjectTab> {
  return {
    glossarySelectedId: id,
    selectionScope: "glossary" as const,
    openedPages: ensureOpenedPage(tab.openedPages, { scope: "glossary", id }),
  };
}

function applyOpenedPagesSelection(
  tab: ProjectTab,
  openedPages: OpenedPage[],
  prefer: OpenedPage | null,
): ProjectTab {
  const nextPage =
    (prefer &&
      openedPages.find((p) => sameOpenedPage(p, prefer))) ||
    openedPages[openedPages.length - 1] ||
    null;
  if (!nextPage) {
    return {
      ...tab,
      openedPages,
      selectedId: null,
      glossarySelectedId: null,
      selectionScope: "tree",
    };
  }
  if (nextPage.scope === "tree") {
    return {
      ...tab,
      openedPages,
      selectedId: nextPage.id,
      selectionScope: "tree",
    };
  }
  return {
    ...tab,
    openedPages,
    glossarySelectedId: nextPage.id,
    selectionScope: "glossary",
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
    const normalizedTabs = tabs.map(normalizePersistedTab);
    set({
      hydrated: true,
      hasLaunchedBefore,
      homeMode: hasLaunchedBefore ? "history" : "templates",
      tabs: normalizedTabs,
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
    const first = firstId(normalized.tree);
    const tab: ProjectTab = {
      id,
      project: normalized,
      selectedId: first,
      selectionScope: "tree",
      glossarySelectedId: null,
      openedPages: first ? [{ scope: "tree", id: first }] : [],
      openedDirty: {},
      collapsedIds: {},
      glossaryCollapsedIds: {},
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
    set((s) =>
      patchActive(s, (t) =>
        id
          ? { ...t, ...openTreePage(t, id) }
          : { ...t, selectedId: null, selectionScope: "tree" as const },
      ),
    ),

  selectGlossary: (id) =>
    set((s) =>
      patchActive(s, (t) => {
        if (!id) {
          return { ...t, glossarySelectedId: null };
        }
        const entry = findGlossaryById(t.project.glossary, id);
        if (!entry) return t;
        if (entry.kind === "ref" && entry.sourceNodeId) {
          const src = findNodeById(t.project.tree, entry.sourceNodeId);
          if (src) {
            return {
              ...t,
              glossarySelectedId: id,
              ...openTreePage(t, src.id),
            };
          }
        }
        return { ...t, ...openGlossaryPage(t, id) };
      }),
    ),

  openWorkspacePage: (page) => {
    if (page.scope === "tree") get().selectNode(page.id);
    else get().selectGlossary(page.id);
  },

  closeOpenedPage: (page) =>
    set((s) =>
      patchActive(s, (t) => {
        const openedPages = (t.openedPages ?? []).filter(
          (p) => !sameOpenedPage(p, page),
        );
        const editing = getWorkspaceEditTarget(t);
        const closingCurrent =
          editing &&
          editing.scope === page.scope &&
          editing.id === page.id;
        if (!closingCurrent) {
          return { ...t, openedPages };
        }
        return applyOpenedPagesSelection(t, openedPages, null);
      }),
    ),

  closeOtherOpenedPages: (keep) =>
    set((s) =>
      patchActive(s, (t) => {
        const keepPage =
          (t.openedPages ?? []).find((p) => sameOpenedPage(p, keep)) ?? keep;
        return applyOpenedPagesSelection(t, [keepPage], keepPage);
      }),
    ),

  closeAllOpenedPages: () =>
    set((s) =>
      patchActive(s, (t) => applyOpenedPagesSelection(t, [], null)),
    ),

  toggleCollapsed: (id) =>
    set((s) =>
      patchActive(s, (t) => {
        const next = { ...t.collapsedIds };
        if (next[id]) delete next[id];
        else next[id] = true;
        return { ...t, collapsedIds: next };
      }),
    ),

  toggleGlossaryCollapsed: (id) =>
    set((s) =>
      patchActive(s, (t) => {
        const next = { ...t.glossaryCollapsedIds };
        if (next[id]) delete next[id];
        else next[id] = true;
        return { ...t, glossaryCollapsedIds: next };
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

  expandGlossaryNodes: (ids) =>
    set((s) =>
      patchActive(s, (t) => {
        if (!ids.length) return t;
        const next = { ...t.glossaryCollapsedIds };
        let changed = false;
        for (const id of ids) {
          if (next[id]) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? { ...t, glossaryCollapsedIds: next } : t;
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
        withPageDirty(
          bump(t, {
            ...t.project,
            tree: updateNode(t.project.tree, id, { title }),
          }),
          { scope: "tree", id },
        ),
      ),
    ),

  setContent: (id, content) =>
    set((s) =>
      patchActive(s, (t) =>
        withPageDirty(
          bump(t, {
            ...t.project,
            tree: updateNode(t.project.tree, id, { content }),
          }),
          { scope: "tree", id },
        ),
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
        const next = bump(t, { ...t.project, tree });
        return select
          ? { ...next, ...openTreePage(next, node.id) }
          : next;
      }),
    ),

  selectNodeOnTab: (tabId, nodeId) =>
    set((s) =>
      patchTabById(s, tabId, (t) =>
        nodeId
          ? { ...t, ...openTreePage(t, nodeId) }
          : { ...t, selectedId: null },
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
        ...openTreePage(t, child.id),
      })),
    );
  },

  addChildNodeWithContent: (parentId, title, content) => {
    const tab = get().getActiveTab();
    if (!tab) return null;
    if (!findNodeById(tab.project.tree, parentId)) return null;
    const child = createNode({
      title: title.trim() || t("editor.nodeUntitled"),
      content: content ?? "",
    });
    set((s) =>
      patchActive(s, (t) => ({
        ...bump(t, {
          ...t.project,
          tree: addChild(t.project.tree, parentId, child),
        }),
        ...openTreePage(t, child.id),
      })),
    );
    get().rescanGlossaryLinks();
    return child.id;
  },

  addSiblingNode: (afterId) => {
    const sibling = createNode();
    set((s) =>
      patchActive(s, (t) => ({
        ...bump(t, {
          ...t.project,
          tree: addSiblingAfter(t.project.tree, afterId, sibling),
        }),
        ...openTreePage(t, sibling.id),
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
          ...openTreePage(t, copy.id),
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
          ...openTreePage(t, copy.id),
        };
      }),
    );
  },

  importSubtree: (parentId, nodes) => {
    const list = (Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean);
    if (!list.length) return;
    set((s) =>
      patchActive(s, (t) => {
        const parentOk =
          parentId !== null && Boolean(findNodeById(t.project.tree, parentId));
        const mountUnder: string | null = parentOk ? parentId : null;
        let tree = t.project.tree;
        for (const n of list) {
          tree = addChild(tree, mountUnder, n);
        }
        return {
          ...bump(t, { ...t.project, tree }),
          ...openTreePage(t, list[0]!.id),
        };
      }),
    );
  },

  deleteNode: (id) =>
    set((s) =>
      patchActive(s, (t) => {
        const node = findNodeById(t.project.tree, id);
        let glossary = t.project.glossary;
        let glossaryLogs = t.project.glossaryLogs;
        if (node && collectRefsToSource(glossary, id).length > 0) {
          glossary = materializeRefsToSource(glossary, node);
          glossaryLogs = [
            {
              id: createId(),
              entryId: findGlossaryBySourceId(t.project.glossary, id)?.id ?? id,
              kind: "ref" as const,
              status: "removed" as const,
              message: "大纲节点已删，词条已物化为独立副本",
              at: new Date().toISOString(),
            },
            ...glossaryLogs,
          ].slice(0, 2000);
        }
        const tree = removeNode(t.project.tree, id);
        const next: ProjectTab = {
          ...bump(t, { ...t.project, tree, glossary, glossaryLogs }),
          selectedId: t.selectedId === id ? firstId(tree) : t.selectedId,
        };
        const openedPages = pruneOpenedPages(next);
        const selectedStillOpen =
          next.selectedId &&
          openedPages.some(
            (p) => p.scope === "tree" && p.id === next.selectedId,
          );
        return {
          ...next,
          openedPages:
            next.selectedId && !selectedStillOpen
              ? ensureOpenedPage(openedPages, {
                  scope: "tree",
                  id: next.selectedId,
                })
              : openedPages,
        };
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

  releaseChildren: (id) =>
    set((s) =>
      patchActive(s, (t) => {
        const { tree, selectId } = releaseTreeChildren(t.project.tree, id);
        if (tree === t.project.tree) return t;
        return {
          ...bump(t, { ...t.project, tree }),
          selectedId: selectId ?? t.selectedId,
        };
      }),
    ),

  dissolveNode: (id) =>
    set((s) =>
      patchActive(s, (t) => {
        const { tree, selectId } = dissolveTreeNode(t.project.tree, id);
        if (tree === t.project.tree) return t;
        return {
          ...bump(t, { ...t.project, tree }),
          selectedId: selectId ?? t.selectedId,
        };
      }),
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

  moveSibling: (id, dir) =>
    set((s) =>
      patchActive(s, (t) =>
        bump(t, {
          ...t.project,
          tree: moveSiblingInTree(t.project.tree, id, dir),
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
        return withPageDirty(bump(t, { ...t.project, tree }), {
          scope: "tree",
          id: nodeId,
        });
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
        withPageDirty(
          bump(t, {
            ...t.project,
            tree: removeAttachment(t.project.tree, nodeId, attachmentId),
          }),
          { scope: "tree", id: nodeId },
        ),
      ),
    );
    return meta;
  },

  setGlossaryTitle: (id, title) => {
    set((s) =>
      patchActive(s, (t) => {
        const entry = findGlossaryById(t.project.glossary, id);
        if (!entry || entry.kind === "ref") return t;
        return withPageDirty(
          bump(t, {
            ...t.project,
            glossary: updateGlossaryNode(t.project.glossary, id, { title }),
          }),
          { scope: "glossary", id },
        );
      }),
    );
    // 标题参与扫链：改完立刻重扫，否则正文里的同名不会出现链接
    get().rescanGlossaryLinks();
  },

  setGlossaryContent: (id, content) =>
    set((s) =>
      patchActive(s, (t) => {
        const entry = findGlossaryById(t.project.glossary, id);
        if (!entry || entry.kind === "ref") return t;
        return withPageDirty(
          bump(t, {
            ...t.project,
            glossary: updateGlossaryNode(t.project.glossary, id, { content }),
          }),
          { scope: "glossary", id },
        );
      }),
    ),

  referenceAsGlossary: (treeNodeId) => {
    const tab = get().getActiveTab();
    if (!tab) return null;
    const existing = findGlossaryBySourceId(tab.project.glossary, treeNodeId);
    if (existing) {
      get().selectGlossary(existing.id);
      return existing.id;
    }
    const node = findNodeById(tab.project.tree, treeNodeId);
    if (!node) return null;
    const entry = createRefFromTreeNode(node);
    const log: GlossaryLog = {
      id: createId(),
      entryId: entry.id,
      kind: "ref",
      status: "active",
      message: "手动引用为词条",
      at: new Date().toISOString(),
    };
    set((s) =>
      patchActive(s, (t) => ({
        ...bump(t, {
          ...t.project,
          glossary: addGlossaryChild(t.project.glossary, null, entry),
          glossaryLogs: [log, ...t.project.glossaryLogs].slice(0, 2000),
        }),
        glossarySelectedId: entry.id,
      })),
    );
    get().rescanGlossaryLinks();
    return entry.id;
  },

  copyAsGlossary: (treeNodeId) => {
    const tab = get().getActiveTab();
    if (!tab) return null;
    const node = findNodeById(tab.project.tree, treeNodeId);
    if (!node) return null;
    const entry = createCopyFromTreeNode(node);
    set((s) =>
      patchActive(s, (t) => ({
        ...bump(t, {
          ...t.project,
          glossary: addGlossaryChild(t.project.glossary, null, entry),
        }),
        ...openGlossaryPage(t, entry.id),
      })),
    );
    get().rescanGlossaryLinks();
    return entry.id;
  },

  addGlossaryChildNode: (parentId) => {
    const child = createGlossaryNode({ kind: "local" });
    set((s) =>
      patchActive(s, (t) => ({
        ...bump(t, {
          ...t.project,
          glossary: addGlossaryChild(t.project.glossary, parentId, child),
        }),
        ...openGlossaryPage(t, child.id),
      })),
    );
  },

  addGlossaryChildWithContent: (parentId, title, content) => {
    const tab = get().getActiveTab();
    if (!tab) return null;
    if (parentId && !findGlossaryById(tab.project.glossary, parentId)) {
      return null;
    }
    const trimmed = title.trim() || t("glossary.untitled");
    const child = createGlossaryNode({
      kind: "local",
      title: trimmed,
      content: content ?? "",
    });
    set((s) =>
      patchActive(s, (t) => ({
        ...bump(t, {
          ...t.project,
          glossary: addGlossaryChild(t.project.glossary, parentId, child),
        }),
        ...openGlossaryPage(t, child.id),
      })),
    );
    get().rescanGlossaryLinks();
    return child.id;
  },

  bindGlossaryManual: ({ hostNodeId, text, occurrenceIndex, entryIds }) => {
    const tab = get().getActiveTab();
    if (!tab) return;
    const anchor = text.replace(/\u00a0/g, " ").replace(/[\u200b\u200c\u200d\ufeff]/g, "").trim();
    if (!anchor || !entryIds.length) return;

    const treeNode = findNodeById(tab.project.tree, hostNodeId);
    const glossNode = findGlossaryById(tab.project.glossary, hostNodeId);
    const hostContent =
      treeNode?.content ??
      (glossNode ? resolveGlossaryContent(glossNode, tab.project.tree) : null);
    if (hostContent == null) return;

    // 编辑器选区来自纯文本；存盘为 Markdown——精确 + 宽松匹配。
    // 找不到偏移时仍建链：装饰层靠 occurrenceIndex 画高亮，避免「同名绑上看不见」。
    let range = locateAnchorInHost(hostContent, anchor, occurrenceIndex);
    if (!range || range.end <= range.start) {
      const idx = hostContent.indexOf(anchor);
      range =
        idx >= 0
          ? { start: idx, end: idx + anchor.length }
          : {
              start: 0,
              end: Math.min(anchor.length, Math.max(hostContent.length, 0)),
            };
    }

    const at = new Date().toISOString();
    const uniqueIds = [...new Set(entryIds)].filter((id) =>
      findGlossaryById(tab.project.glossary, id),
    );
    if (!uniqueIds.length) return;

    set((s) =>
      patchActive(s, (t) => {
        let glossaryLinks = [...t.project.glossaryLinks];
        const logs: GlossaryLog[] = [];

        for (const entryId of uniqueIds) {
          const dup = glossaryLinks.find(
            (l) =>
              l.entryId === entryId &&
              l.hostNodeId === hostNodeId &&
              l.source === "manual" &&
              l.status === "active" &&
              l.start === range.start &&
              l.end === range.end,
          );
          if (dup) continue;

          const link = createManualLink({
            entryId,
            hostNodeId,
            start: range.start,
            end: range.end,
            text: anchor,
            occurrenceIndex,
          });
          glossaryLinks.push(link);
          logs.push({
            id: createId(),
            entryId,
            kind: "ref",
            status: "active",
            hostNodeId,
            before: anchor,
            message: "手动绑定",
            at,
            linkId: link.id,
          });
        }

        if (!logs.length) return t;
        return bump(t, {
          ...t.project,
          glossaryLinks,
          glossaryLogs: [...logs, ...t.project.glossaryLogs].slice(0, 2000),
        });
      }),
    );
    get().rescanGlossaryLinks();
  },

  deleteGlossaryEntry: (id) =>
    set((s) =>
      patchActive(s, (t) => {
        const glossary = removeGlossaryNode(t.project.glossary, id);
        const glossaryLinks = t.project.glossaryLinks.map((l) =>
          l.entryId === id && l.status === "active"
            ? {
                ...l,
                status: "removed" as const,
                updatedAt: new Date().toISOString(),
              }
            : l,
        );
        const log: GlossaryLog = {
          id: createId(),
          entryId: id,
          kind: "ref",
          status: "removed",
          message: "仅取消全局引用，原节点依然保留在树中",
          at: new Date().toISOString(),
        };
        const glossarySelectedId =
          t.glossarySelectedId === id ? null : t.glossarySelectedId;
        const next: ProjectTab = {
          ...bump(t, {
            ...t.project,
            glossary,
            glossaryLinks,
            glossaryLogs: [log, ...t.project.glossaryLogs].slice(0, 2000),
          }),
          glossarySelectedId,
          selectionScope:
            t.glossarySelectedId === id ? "tree" : t.selectionScope,
        };
        return { ...next, openedPages: pruneOpenedPages(next) };
      }),
    ),

  moveGlossary: (id, parentId, index) =>
    set((s) =>
      patchActive(s, (t) =>
        bump(t, {
          ...t.project,
          glossary: moveGlossaryNode(t.project.glossary, id, parentId, index),
        }),
      ),
    ),

  setGlossaryBlacklist: (id, blacklist) => {
    set((s) =>
      patchActive(s, (t) => {
        const entry = findGlossaryById(t.project.glossary, id);
        if (!entry) return t;
        const termTitle = resolveGlossaryTitle(entry, t.project.tree).trim();
        // 过滤掉与词条名相同的无效项
        const cleaned = blacklist
          .map((x) => x.trim())
          .filter((x) => x && x !== termTitle);
        const unique = [...new Set(cleaned)];
        return bump(t, {
          ...t.project,
          glossary: updateGlossaryNode(t.project.glossary, id, {
            blacklist: unique,
          }),
        });
      }),
    );
    get().rescanGlossaryLinks();
  },

  setGlossaryAliases: (id, aliases) => {
    set((s) =>
      patchActive(s, (t) => {
        const entry = findGlossaryById(t.project.glossary, id);
        if (!entry) return t;
        const termTitle = resolveGlossaryTitle(entry, t.project.tree).trim();
        const cleaned = aliases
          .map((x) => x.trim())
          .filter((x) => x && x !== termTitle);
        const unique = [...new Set(cleaned)];
        return bump(t, {
          ...t.project,
          glossary: updateGlossaryNode(t.project.glossary, id, {
            aliases: unique,
          }),
        });
      }),
    );
    get().rescanGlossaryLinks();
  },

  confirmGlossaryAutoLink: (linkId) => {
    const tab = get().getActiveTab();
    if (!tab) return;
    const link = tab.project.glossaryLinks.find((l) => l.id === linkId);
    if (!link || !isAutoLink(link) || link.status !== "active") return;
    const anchor = (link.matchedText || link.anchorText || "").trim();
    if (!anchor) return;

    const hostTree = findNodeById(tab.project.tree, link.hostNodeId);
    const hostGloss = findGlossaryById(tab.project.glossary, link.hostNodeId);
    const hostContent =
      hostTree?.content ??
      (hostGloss ? resolveGlossaryContent(hostGloss, tab.project.tree) : "");
    const occurrenceIndex = occurrenceIndexBefore(
      hostContent,
      anchor,
      link.start,
    );

    const at = new Date().toISOString();
    set((s) =>
      patchActive(s, (t) => {
        const glossaryLinks = t.project.glossaryLinks.map((l) =>
          l.id === linkId
            ? {
                ...l,
                source: "manual" as const,
                status: "active" as const,
                anchorText: anchor,
                matchedText: anchor,
                occurrenceIndex,
                updatedAt: at,
              }
            : l,
        );
        const log: GlossaryLog = {
          id: createId(),
          entryId: link.entryId,
          kind: "ref",
          status: "active",
          hostNodeId: link.hostNodeId,
          before: anchor,
          message: "确认疑似提及",
          at,
          linkId,
        };
        return bump(t, {
          ...t.project,
          glossaryLinks,
          glossaryLogs: [log, ...t.project.glossaryLogs].slice(0, 2000),
        });
      }),
    );
    get().rescanGlossaryLinks();
  },

  setGlossaryColor: (id, color) =>
    set((s) =>
      patchActive(s, (t) => {
        const entry = findGlossaryById(t.project.glossary, id);
        if (!entry) return t;
        const next =
          color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : undefined;
        if ((entry.color ?? undefined) === next) return t;
        return bump(t, {
          ...t.project,
          glossary: updateGlossaryNode(t.project.glossary, id, {
            color: next,
          }),
        });
      }),
    ),

  rescanGlossaryLinks: () => {
    set((s) =>
      patchActive(s, (t) => {
        const { links, logs } = scanProjectLinks(
          t.project.tree,
          t.project.glossary,
          t.project.glossaryLinks,
        );
        if (
          links === t.project.glossaryLinks &&
          logs.length === 0
        ) {
          return t;
        }
        // 浅比较：无实质变化则不 bump revision 过多——仍合并 logs
        const sameLinks =
          links.length === t.project.glossaryLinks.length &&
          links.every((l, i) => {
            const p = t.project.glossaryLinks[i];
            return (
              p &&
              p.id === l.id &&
              p.status === l.status &&
              p.start === l.start &&
              p.end === l.end
            );
          });
        if (sameLinks && logs.length === 0) return t;
        return bump(t, {
          ...t.project,
          glossaryLinks: links,
          glossaryLogs: [...logs, ...t.project.glossaryLogs].slice(0, 2000),
        });
      }),
    );
  },

  removeGlossaryLink: (linkId) =>
    set((s) =>
      patchActive(s, (t) => {
        const link = t.project.glossaryLinks.find((l) => l.id === linkId);
        if (!link) return t;
        const glossaryLinks = t.project.glossaryLinks.map((l) =>
          l.id === linkId
            ? {
                ...l,
                status: "removed" as const,
                updatedAt: new Date().toISOString(),
              }
            : l,
        );
        const log: GlossaryLog = {
          id: createId(),
          entryId: link.entryId,
          kind: "ref",
          status: "removed",
          hostNodeId: link.hostNodeId,
          before: sentenceForLink(t.project, link),
          message:
            link.source === "manual" ? "手动解绑" : "手动移除引用",
          at: new Date().toISOString(),
          linkId,
        };
        return bump(t, {
          ...t.project,
          glossaryLinks,
          glossaryLogs: [log, ...t.project.glossaryLogs].slice(0, 2000),
        });
      }),
    ),

  restoreGlossaryLink: (linkId) =>
    set((s) =>
      patchActive(s, (t) => {
        const link = t.project.glossaryLinks.find((l) => l.id === linkId);
        if (!link) return t;
        const glossaryLinks = t.project.glossaryLinks.map((l) =>
          l.id === linkId
            ? {
                ...l,
                status: "active" as const,
                // 恢复时保留原 source；旧数据无 source 仍当 auto
                updatedAt: new Date().toISOString(),
              }
            : l,
        );
        const log: GlossaryLog = {
          id: createId(),
          entryId: link.entryId,
          kind: "ref",
          status: "active",
          hostNodeId: link.hostNodeId,
          before: sentenceForLink(t.project, link),
          message:
            link.source === "manual" ? "恢复手动绑定" : "从日志恢复引用",
          at: new Date().toISOString(),
          linkId,
        };
        return bump(t, {
          ...t.project,
          glossaryLinks,
          glossaryLogs: [log, ...t.project.glossaryLogs].slice(0, 2000),
        });
      }),
    ),

  clearBlacklistBlock: (linkId) => {
    const tab = get().getActiveTab();
    if (!tab) return;
    const link = tab.project.glossaryLinks.find((l) => l.id === linkId);
    if (!link) return;
    const entry = findGlossaryById(tab.project.glossary, link.entryId);
    if (!entry) return;
    const phrase =
      link.reason?.startsWith("blacklist:")
        ? link.reason.slice("blacklist:".length)
        : link.matchedText;
    const blacklist = entry.blacklist.filter((b) => b !== phrase);
    set((s) =>
      patchActive(s, (t) => {
        const glossary = updateGlossaryNode(t.project.glossary, entry.id, {
          blacklist,
        });
        const glossaryLinks = t.project.glossaryLinks.map((l) =>
          l.id === linkId
            ? {
                ...l,
                status: "active" as const,
                reason: undefined,
                updatedAt: new Date().toISOString(),
              }
            : l,
        );
        const log: GlossaryLog = {
          id: createId(),
          entryId: entry.id,
          kind: "ref",
          status: "active",
          hostNodeId: link.hostNodeId,
          before: sentenceForLink(t.project, link),
          message: "取消黑名单拦截",
          at: new Date().toISOString(),
          linkId,
        };
        return bump(t, {
          ...t.project,
          glossary,
          glossaryLinks,
          glossaryLogs: [log, ...t.project.glossaryLogs].slice(0, 2000),
        });
      }),
    );
    get().rescanGlossaryLinks();
  },

  renameGlossaryTerm: (entryId, newTitle) => {
    const tab = get().getActiveTab();
    if (!tab) return;
    const entry = findGlossaryById(tab.project.glossary, entryId);
    if (!entry) return;
    const oldTitle = resolveGlossaryTitle(entry, tab.project.tree);
    if (oldTitle === newTitle) return;

    set((s) =>
      patchActive(s, (t) => {
        const ent = findGlossaryById(t.project.glossary, entryId);
        if (!ent) return t;
        let tree = t.project.tree;
        let glossary = t.project.glossary;
        const at = new Date().toISOString();

        const renameHistory = [
          ...(ent.renameHistory ?? []),
          { from: oldTitle, to: newTitle, at },
        ];
        const aliases = [
          ...new Set(
            [...ent.aliases, oldTitle].map((a) => a.trim()).filter(Boolean),
          ),
        ].filter((a) => a !== newTitle);

        if (ent.kind === "ref" && ent.sourceNodeId) {
          tree = updateNode(tree, ent.sourceNodeId, { title: newTitle });
          glossary = updateGlossaryNode(glossary, entryId, {
            renameHistory,
            aliases,
          });
        } else {
          glossary = updateGlossaryNode(glossary, entryId, {
            title: newTitle,
            renameHistory,
            aliases,
          });
        }

        return bump(t, {
          ...t.project,
          tree,
          glossary,
        });
      }),
    );
    get().rescanGlossaryLinks();
  },

  /**
   * 撤销单条「同步替换」审查日志：
   * 从 message 解析旧名，按 link 区间还原正文，并把该处引用标为 revoked。
   * 不依赖 UI；日志面板只调此 API。
   */
  undoGlossaryEditLog: (logId) => {
    set((s) =>
      patchActive(s, (t) => {
        const log = t.project.glossaryLogs.find((l) => l.id === logId);
        if (!log || log.kind !== "edit" || !log.linkId || !log.hostNodeId) {
          return t;
        }
        const link = t.project.glossaryLinks.find((l) => l.id === log.linkId);
        if (!link) return t;
        const host = findNodeById(t.project.tree, log.hostNodeId);
        if (!host) return t;
        // 改名日志格式：同步替换「旧」→「新」
        const m = /「(.+?)」→「(.+?)」/.exec(log.message);
        const oldName = m?.[1];
        if (!oldName) return t;
        const content = replaceRanges(host.content, [
          { start: link.start, end: link.end, next: oldName },
        ]);
        const tree = updateNode(t.project.tree, log.hostNodeId, { content });
        const glossaryLinks = t.project.glossaryLinks.map((l) =>
          l.id === link.id
            ? {
                ...l,
                matchedText: oldName,
                end: l.start + oldName.length,
                status: "revoked" as const,
                updatedAt: new Date().toISOString(),
              }
            : l,
        );
        const undoLog: GlossaryLog = {
          id: createId(),
          entryId: log.entryId,
          kind: "edit",
          status: "revoked",
          hostNodeId: log.hostNodeId,
          before: log.after,
          after: log.before,
          message: "撤销同步替换并解除该处引用",
          at: new Date().toISOString(),
          linkId: link.id,
        };
        return bump(t, {
          ...t.project,
          tree,
          glossaryLogs: [undoLog, ...t.project.glossaryLogs].slice(0, 2000),
          glossaryLinks,
        });
      }),
    );
  },

  appendGlossaryLog: (log) =>
    set((s) =>
      patchActive(s, (t) =>
        bump(t, {
          ...t.project,
          glossaryLogs: [log, ...t.project.glossaryLogs].slice(0, 2000),
        }),
      ),
    ),

  setFilePath: (tabId, path) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, filePath: path } : t,
      ),
    })),

  markSynced: (tabId, revision) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, syncedRevision: revision, openedDirty: {} }
          : t,
      ),
    })),

  setSaveError: (msg) => set({ saveError: msg }),
}));

/**
 * 按 link 区间从 host 正文抽出原句，写入审计日志 before 字段。
 * host 可能是大纲节点，也可能是 copy/local 词表项。
 */
function sentenceForLink(
  project: ProjectData,
  link: GlossaryLink,
): string {
  const hostTree = findNodeById(project.tree, link.hostNodeId);
  if (hostTree) {
    return snippetAround(hostTree.content, link.start, link.end);
  }
  const hostGloss = findGlossaryById(project.glossary, link.hostNodeId);
  if (hostGloss) {
    return snippetAround(
      resolveGlossaryContent(hostGloss, project.tree),
      link.start,
      link.end,
    );
  }
  return link.matchedText;
}

function normalizePersistedTab(raw: ProjectTab): ProjectTab {
  const project = ensureProjectName(raw.project);
  const selectionScope: SelectionScope =
    raw.selectionScope === "glossary" ? "glossary" : "tree";
  const glossarySelectedId = raw.glossarySelectedId ?? null;
  const selectedId = raw.selectedId ?? null;
  let openedPages = Array.isArray(raw.openedPages)
    ? (raw.openedPages as OpenedPage[]).filter(
        (p) =>
          p &&
          (p.scope === "tree" || p.scope === "glossary") &&
          typeof p.id === "string",
      )
    : [];
  if (!openedPages.length) {
    if (selectionScope === "glossary" && glossarySelectedId) {
      openedPages = [{ scope: "glossary", id: glossarySelectedId }];
    } else if (selectedId) {
      openedPages = [{ scope: "tree", id: selectedId }];
    }
  }
  const openedDirty =
    raw.openedDirty && typeof raw.openedDirty === "object"
      ? (raw.openedDirty as Record<string, true>)
      : {};
  const base: ProjectTab = {
    ...raw,
    project,
    selectedId,
    selectionScope,
    glossarySelectedId,
    openedPages,
    openedDirty,
    glossaryCollapsedIds: raw.glossaryCollapsedIds ?? {},
    collapsedIds: raw.collapsedIds ?? {},
    searchQuery: raw.searchQuery ?? "",
  };
  return { ...base, openedPages: pruneOpenedPages(base) };
}

export function isOpenedPageDirty(
  tab: ProjectTab,
  page: OpenedPage,
): boolean {
  return Boolean(tab.openedDirty?.[openedPageKey(page)]);
}

/** 解析「已打开」页显示标题 */
export function resolveOpenedPageTitle(
  tab: ProjectTab,
  page: OpenedPage,
): string {
  if (page.scope === "tree") {
    const node = findNodeById(tab.project.tree, page.id);
    return node?.title?.trim() || t("editor.nodeUntitled");
  }
  const entry = findGlossaryById(tab.project.glossary, page.id);
  if (!entry) return t("glossary.untitled");
  return (
    resolveGlossaryTitle(entry, tab.project.tree).trim() ||
    t("glossary.untitled")
  );
}

export function getSelectedNodeFromSession(): TreeNode | null {
  const tab = useSessionStore.getState().getActiveTab();
  if (!tab?.selectedId) return null;
  return findNodeById(tab.project.tree, tab.selectedId);
}

/** 当前工作区要编辑的标题/正文（树或词表） */
export function getWorkspaceEditTarget(tab: ProjectTab): {
  scope: SelectionScope;
  id: string;
  title: string;
  content: string;
  numberLabel: string | null;
} | null {
  if (tab.selectionScope === "glossary" && tab.glossarySelectedId) {
    const entry = findGlossaryById(tab.project.glossary, tab.glossarySelectedId);
    if (!entry || entry.kind === "ref") {
      // fall through to tree
    } else {
      return {
        scope: "glossary",
        id: entry.id,
        title: resolveGlossaryTitle(entry, tab.project.tree),
        content: resolveGlossaryContent(entry, tab.project.tree),
        numberLabel: null,
      };
    }
  }
  if (!tab.selectedId) return null;
  const node = findNodeById(tab.project.tree, tab.selectedId);
  if (!node) return null;
  return {
    scope: "tree",
    id: node.id,
    title: node.title,
    content: node.content,
    numberLabel: null,
  };
}

export { countActiveLinks };
export type { GlossaryLink, GlossaryLog, GlossaryNode };
