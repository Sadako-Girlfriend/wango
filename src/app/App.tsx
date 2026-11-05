/**
 * 应用壳：多项目选项卡 + 首页；打开/模板只加 tab。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collectGlossaryColors,
  collectGlossaryBodyPreviews,
  collectGlossaryTitles,
  collectRefsToSource,
  createNode,
  findGlossaryById,
  findGlossaryBySourceId,
  findNodeById,
  flattenVisible,
  getNumberById,
  isManualLink,
  withNumbering,
} from "@/domain";
import {
  toAiMarkdown,
  toBatchMajorPngs,
  toBatchNodePngs,
  toDocx,
  toLongPdf,
  toLongTreePng,
  toMindmapPng,
} from "@/export";
import { getPlugin } from "@/plugins";
import {
  displayTabTitle,
  getWorkspaceEditTarget,
  isOpenedPageDirty,
  resolveOpenedPageTitle,
  tabNeedsCloseConfirm,
  useSessionStore,
  type OpenedPage,
  type ProjectTab,
} from "@/store/sessionStore";
import { LeftRail } from "@/ui/glossary/LeftRail";
import { GlossaryPane } from "@/ui/glossary/GlossaryPane";
import { GlossaryLogPanel } from "@/ui/glossary/GlossaryLogPanel";
import { GlossaryPickerDialog } from "@/ui/glossary/GlossaryPickerDialog";
import {
  GlossaryPeekPanel,
  mergePeekTabs,
} from "@/ui/glossary/GlossaryPeekPanel";
import glossaryDlg from "@/ui/glossary/GlossaryDialogs.module.css";
import type { GlossaryEditorSelection } from "@/editor/EditorView";
import type { RecentEntry } from "@/desktop/sessionPersist";
import { InspireSessionApplier } from "@/ai/inspireApply";
import {
  inspireFromPasteStream,
  inspireFromSentenceStream,
  inspireOutlineOnlyStream,
  inspireRefineStream,
} from "@/ai/inspireStream";
import type { InspireEvent } from "@/ai/inspireProtocol";
import { ensureApiSettings, isApiConfigured } from "@/ai/openaiCompat";
import {
  emptyAppSettings,
  getAppSettings,
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
} from "@/desktop/appSettings";
import {
  openStagedAttachment,
  removeStagedAttachment,
} from "@/desktop/attachmentBridge";
import { focusZoneEl, useAppHotkeys } from "@/hotkeys";
import { setLocale } from "@/i18n";
import {
  exportContentLongPngFile,
  exportContentPngBatch,
  exportDocxFile,
  exportLongPdfFile,
  exportMarkdownFile,
  exportMindmapPngFile,
  loadWangoFromPath,
  openWangoFile,
  pickOutlineImportFile,
  saveOrSaveAsWango,
  saveWangoFile,
} from "@/desktop/fileBridge";
import { nativeDeleteFile } from "@/desktop/nativeFs";
import { defaultWangoFileName } from "@/desktop/pathUtils";
import type {
  AgentSession,
  AgentThread,
  AttachmentMeta,
  ProjectData,
  TreeNode,
} from "@/domain";
import { Header, type InspireMode } from "@/ui/layout/Header";
import {
  ExportDialog,
  type ExportRequest,
} from "@/ui/layout/ExportDialog";
import { TwoPane } from "@/ui/layout/TwoPane";
import { ProjectTabBar } from "@/ui/layout/ProjectTabBar";
import { CloseConfirmDialog } from "@/ui/layout/CloseConfirmDialog";
import { RecentRemoveDialog } from "@/ui/layout/RecentRemoveDialog";
import { InspireBusy } from "@/ui/layout/InspireBusy";
import { InspirePromptDialog } from "@/ui/layout/InspirePromptDialog";
import {
  PasteImportDialog,
  type PasteImportCommit,
} from "@/ui/layout/PasteImportDialog";
import { OutlineFileImportDialog } from "@/ui/layout/OutlineFileImportDialog";
import {
  SettingsDialog,
  type SettingsDraft,
} from "@/ui/layout/SettingsDialog";
import { TreePane } from "@/ui/tree/TreePane";
import { WorkspacePane } from "@/ui/workspace/WorkspacePane";
import { AgentPane } from "@/ui/agent/AgentPane";
import { HomeView } from "@/ui/home/HomeView";
import { t } from "@/i18n";
import { useAgentStore } from "@/store/agentStore";
import {
  flushSessionSave,
  useSessionLifecycle,
  useWindowCloseGuard,
} from "./useSessionLifecycle";
type OpenedCloseAction =
  | { type: "one"; page: OpenedPage }
  | { type: "others"; keep: OpenedPage }
  | { type: "all" };

type PendingClose =
  | { kind: "tab"; tabId: string }
  | { kind: "app"; queue: string[]; resolve: (ok: boolean) => void }
  | { kind: "opened"; action: OpenedCloseAction; title: string };

/** 关掉「已打开」页前是否要先问保存 */
function openedPageNeedsSavePrompt(
  tab: ProjectTab,
  page: OpenedPage,
): boolean {
  if (isOpenedPageDirty(tab, page)) return true;
  const editing = getWorkspaceEditTarget(tab);
  return Boolean(
    editing &&
      editing.scope === page.scope &&
      editing.id === page.id &&
      tabNeedsCloseConfirm(tab),
  );
}

export function App() {
  const hydrated = useSessionLifecycle();
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const homeMode = useSessionStore((s) => s.homeMode);
  const recents = useSessionStore((s) => s.recents);
  const saveError = useSessionStore((s) => s.saveError);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(true);
  const [agentVisible, setAgentVisible] = useState(true);
  const [agentToggleRequest, setAgentToggleRequest] = useState(0);
  const [pendingRecentRemove, setPendingRecentRemove] =
    useState<RecentEntry | null>(null);
  const [settingsSnapshot, setSettingsSnapshot] = useState<AppSettings>(
    emptyAppSettings(),
  );
  const [inspirePhase, setInspirePhase] = useState<
    "idle" | "generating" | "cancelling"
  >("idle");
  /** 首个节点出现前：工作区遮罩 */
  const [inspirePreparing, setInspirePreparing] = useState(false);
  /** 准备期遮罩：深度思考 reasoning 流式文本 */
  const [inspireThinking, setInspireThinking] = useState("");
  const [inspireTabId, setInspireTabId] = useState<string | null>(null);
  const [inspirePrompt, setInspirePrompt] = useState<
    null | "sentence" | "outline"
  >(null);
  const [pasteImportOpen, setPasteImportOpen] = useState(false);
  const [fileImportPayload, setFileImportPayload] = useState<{
    fileName: string;
    kind: "markdown" | "docx";
    text?: string;
    bytes?: ArrayBuffer;
  } | null>(null);
  const [glossaryRefTip, setGlossaryRefTip] = useState<{
    nodeId: string;
    dontShow: boolean;
  } | null>(null);
  const [logPanel, setLogPanel] = useState<{
    entryId: string;
  } | null>(null);
  const [glossaryPicker, setGlossaryPicker] = useState<
    | {
        mode: "bind" | "childParent";
        sel: GlossaryEditorSelection;
      }
    | null
  >(null);
  const [glossaryPeek, setGlossaryPeek] = useState<{
    tabs: string[];
    activeId: string;
    x: number;
    y: number;
  } | null>(null);
  const rescanTimer = useRef<number | null>(null);
  const inspireAbortRef = useRef<AbortController | null>(null);
  const inspireCancelWaitRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const openSettings = useCallback(async () => {
    const s = await loadAppSettings();
    setSettingsSnapshot(s);
    setSettingsOpen(true);
  }, []);

  const cancelInspire = useCallback(() => {
    if (inspirePhase !== "generating") return;
    setInspirePhase("cancelling");
    inspireAbortRef.current?.abort();
  }, [inspirePhase]);

  const runInspireStream = useCallback(
    async (
      factory: (signal: AbortSignal) => AsyncIterable<InspireEvent>,
    ) => {
      inspireAbortRef.current?.abort();
      if (inspireCancelWaitRef.current) {
        clearTimeout(inspireCancelWaitRef.current);
        inspireCancelWaitRef.current = null;
      }
      const ac = new AbortController();
      inspireAbortRef.current = ac;

      const store = useSessionStore.getState();
      store.markLaunched();
      const tabId = store.openProjectTab({
        project: {
          name: t("inspire.generating"),
          tree: [],
          glossary: [],
          glossaryLinks: [],
          glossaryLogs: [],
        },
      });
      setInspireTabId(tabId);
      setInspirePhase("generating");
      setInspirePreparing(true);
      setInspireThinking("");

      const applier = new InspireSessionApplier(tabId);
      let sawTerminal = false;

      try {
        for await (const ev of factory(ac.signal)) {
          if (ac.signal.aborted) break;
          if (ev.type === "reasoning") {
            setInspireThinking((prev) => prev + ev.text);
            continue;
          }
          if (ev.type === "done" || ev.type === "error") sawTerminal = true;
          applier.apply(ev);
          if (ev.type === "node") {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => setInspirePreparing(false));
            });
          }
        }
        if (!ac.signal.aborted && !sawTerminal) {
          applier.apply({ type: "done" });
        }
      } catch (err) {
        applier.dispose();
        if (!ac.signal.aborted) {
          window.alert(
            err instanceof Error
              ? `${t("inspire.failed")}: ${err.message}`
              : t("inspire.failed"),
          );
        }
      } finally {
        applier.dispose();
        const aborted = ac.signal.aborted;
        if (inspireAbortRef.current === ac) inspireAbortRef.current = null;

        const finishUi = () => {
          setInspirePreparing(false);
          setInspireThinking("");
          setInspireTabId(null);
          setInspirePhase("idle");
          inspireCancelWaitRef.current = null;
        };

        if (aborted) {
          // 取消中展示约 3 秒；空树整页丢掉，已写出的节点保留
          setInspirePhase("cancelling");
          setInspirePreparing(false);
          await new Promise<void>((resolve) => {
            inspireCancelWaitRef.current = setTimeout(resolve, 3000);
          });
          const tab = useSessionStore
            .getState()
            .tabs.find((x) => x.id === tabId);
          if (tab && tab.project.tree.length === 0) {
            useSessionStore.getState().removeTab(tabId);
          } else if (tab) {
            const name = tab.project.name.trim();
            if (!name || name === t("inspire.generating")) {
              const fallback =
                tab.project.tree[0]?.title?.trim() || t("project.untitled");
              useSessionStore.getState().renameTabProject(tabId, fallback);
            }
          }
          finishUi();
        } else {
          finishUi();
        }
      }
    },
    [],
  );

  const onInspireGate = useCallback(async () => {
    const s = await ensureApiSettings();
    if (!isApiConfigured(s)) {
      window.alert(t("inspire.apiMissing"));
      await openSettings();
      return false;
    }
    return true;
  }, [openSettings]);

  /** 粘贴/文件：打开为新项目 tab（不用当前树） */
  const openNewFromOutlineRoot = useCallback((root: TreeNode) => {
    const name =
      root.title.trim() || t("pasteImport.rootDefault");
    const tree =
      root.children.length > 0
        ? root.children
        : [
            createNode({
              title: name,
              content: root.content,
              children: [],
            }),
          ];
    useSessionStore.getState().markLaunched();
    useSessionStore.getState().openProjectTab({
      project: {
        name,
        tree,
        glossary: [],
        glossaryLinks: [],
        glossaryLogs: [],
      },
    });
  }, []);

  /** 粘贴 AI：新开 tab 流式生成 */
  const runPasteInspireAsNew = useCallback(
    async (rawText: string, rootTitle: string) => {
      const s = await ensureApiSettings();
      if (!isApiConfigured(s)) return;

      const store = useSessionStore.getState();
      store.markLaunched();
      const name = rootTitle.trim() || t("inspire.generating");
      const tabId = store.openProjectTab({
        project: {
          name,
          tree: [],
          glossary: [],
          glossaryLinks: [],
          glossaryLogs: [],
        },
      });

      inspireAbortRef.current?.abort();
      if (inspireCancelWaitRef.current) {
        clearTimeout(inspireCancelWaitRef.current);
        inspireCancelWaitRef.current = null;
      }
      const ac = new AbortController();
      inspireAbortRef.current = ac;
      setInspireTabId(tabId);
      setInspirePhase("generating");
      setInspirePreparing(true);
      setInspireThinking("");

      const applier = new InspireSessionApplier(tabId, {
        skipProjectRename: Boolean(rootTitle.trim()),
      });
      let sawTerminal = false;

      try {
        for await (const ev of inspireFromPasteStream(rawText, {
          signal: ac.signal,
        })) {
          if (ac.signal.aborted) break;
          if (ev.type === "reasoning") {
            setInspireThinking((prev) => prev + ev.text);
            continue;
          }
          if (ev.type === "done" || ev.type === "error") sawTerminal = true;
          applier.apply(ev);
          if (ev.type === "node") {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => setInspirePreparing(false));
            });
          }
        }
        if (!ac.signal.aborted && !sawTerminal) {
          applier.apply({ type: "done" });
        }
      } catch (err) {
        applier.dispose();
        if (!ac.signal.aborted) {
          window.alert(
            err instanceof Error
              ? `${t("inspire.failed")}: ${err.message}`
              : t("inspire.failed"),
          );
        }
      } finally {
        applier.dispose();
        const aborted = ac.signal.aborted;
        if (inspireAbortRef.current === ac) inspireAbortRef.current = null;
        const finishUi = () => {
          setInspirePreparing(false);
          setInspireThinking("");
          setInspireTabId(null);
          setInspirePhase("idle");
          inspireCancelWaitRef.current = null;
        };
        if (aborted) {
          setInspirePhase("cancelling");
          setInspirePreparing(false);
          await new Promise<void>((resolve) => {
            inspireCancelWaitRef.current = setTimeout(resolve, 3000);
          });
          const tab = useSessionStore
            .getState()
            .tabs.find((x) => x.id === tabId);
          if (tab && tab.project.tree.length === 0) {
            useSessionStore.getState().removeTab(tabId);
          } else if (tab) {
            const n = tab.project.name.trim();
            if (!n || n === t("inspire.generating")) {
              const fallback =
                tab.project.tree[0]?.title?.trim() || t("project.untitled");
              useSessionStore.getState().renameTabProject(tabId, fallback);
            }
          }
          finishUi();
        } else {
          finishUi();
        }
      }
    },
    [],
  );

  const onPasteImportCommit = useCallback(
    (payload: PasteImportCommit) => {
      setPasteImportOpen(false);
      if (payload.mode === "structure") {
        openNewFromOutlineRoot(payload.root);
        return;
      }
      void runPasteInspireAsNew(payload.text, payload.rootTitle);
    },
    [openNewFromOutlineRoot, runPasteInspireAsNew],
  );

  const onFileImport = useCallback(async () => {
    const picked = await pickOutlineImportFile();
    if (!picked) return;
    setFileImportPayload(picked);
  }, []);

  const onInspireMode = useCallback(
    (mode: InspireMode) => {
      if (mode === "refine") {
        const tab = useSessionStore.getState().tabs.find(
          (x) => x.id === useSessionStore.getState().activeTabId,
        );
        if (!tab) {
          window.alert(t("inspire.needProject"));
          return;
        }
        const snapshot = JSON.parse(
          JSON.stringify(tab.project),
        ) as ProjectData;
        void runInspireStream((signal) =>
          inspireRefineStream(snapshot, { signal }),
        );
        return;
      }
      setInspirePrompt(mode);
    },
    [runInspireStream],
  );

  const selectTab = useSessionStore((s) => s.selectTab);
  const openProjectTab = useSessionStore((s) => s.openProjectTab);
  const removeTab = useSessionStore((s) => s.removeTab);
  const markLaunched = useSessionStore((s) => s.markLaunched);
  const selectNode = useSessionStore((s) => s.selectNode);
  const selectGlossary = useSessionStore((s) => s.selectGlossary);
  const openWorkspacePage = useSessionStore((s) => s.openWorkspacePage);
  const closeOpenedPage = useSessionStore((s) => s.closeOpenedPage);
  const closeOtherOpenedPages = useSessionStore((s) => s.closeOtherOpenedPages);
  const closeAllOpenedPages = useSessionStore((s) => s.closeAllOpenedPages);
  const toggleCollapsed = useSessionStore((s) => s.toggleCollapsed);
  const toggleGlossaryCollapsed = useSessionStore(
    (s) => s.toggleGlossaryCollapsed,
  );
  const setSearchQuery = useSessionStore((s) => s.setSearchQuery);
  const expandNodes = useSessionStore((s) => s.expandNodes);
  const setProjectName = useSessionStore((s) => s.setProjectName);
  const renameTabProject = useSessionStore((s) => s.renameTabProject);
  const setTitle = useSessionStore((s) => s.setTitle);
  const setContent = useSessionStore((s) => s.setContent);
  const setGlossaryTitle = useSessionStore((s) => s.setGlossaryTitle);
  const setGlossaryContent = useSessionStore((s) => s.setGlossaryContent);
  const referenceAsGlossary = useSessionStore((s) => s.referenceAsGlossary);
  const copyAsGlossary = useSessionStore((s) => s.copyAsGlossary);
  const addGlossaryChildNode = useSessionStore((s) => s.addGlossaryChildNode);
  const deleteGlossaryEntry = useSessionStore((s) => s.deleteGlossaryEntry);
  const moveGlossary = useSessionStore((s) => s.moveGlossary);
  const rescanGlossaryLinks = useSessionStore((s) => s.rescanGlossaryLinks);
  const removeGlossaryLink = useSessionStore((s) => s.removeGlossaryLink);
  const setGlossaryAliases = useSessionStore((s) => s.setGlossaryAliases);
  const confirmGlossaryAutoLink = useSessionStore(
    (s) => s.confirmGlossaryAutoLink,
  );
  const setGlossaryColor = useSessionStore((s) => s.setGlossaryColor);
  const bindGlossaryManual = useSessionStore((s) => s.bindGlossaryManual);
  const addGlossaryChildWithContent = useSessionStore(
    (s) => s.addGlossaryChildWithContent,
  );
  const restoreGlossaryLink = useSessionStore((s) => s.restoreGlossaryLink);
  const clearBlacklistBlock = useSessionStore((s) => s.clearBlacklistBlock);
  const renameGlossaryTerm = useSessionStore((s) => s.renameGlossaryTerm);
  const undoGlossaryEditLog = useSessionStore((s) => s.undoGlossaryEditLog);
  const addChildNode = useSessionStore((s) => s.addChildNode);
  const addChildNodeWithContent = useSessionStore(
    (s) => s.addChildNodeWithContent,
  );
  const addSiblingNode = useSessionStore((s) => s.addSiblingNode);
  const copyTreeNode = useSessionStore((s) => s.copyTreeNode);
  const pasteTreeNode = useSessionStore((s) => s.pasteTreeNode);
  const treeClipboard = useSessionStore((s) => s.treeClipboard);
  const setNodePriority = useSessionStore((s) => s.setNodePriority);
  const setNodeLabels = useSessionStore((s) => s.setNodeLabels);
  const deleteNode = useSessionStore((s) => s.deleteNode);
  const promote = useSessionStore((s) => s.promote);
  const demote = useSessionStore((s) => s.demote);
  const releaseChildren = useSessionStore((s) => s.releaseChildren);
  const dissolveNode = useSessionStore((s) => s.dissolveNode);
  const move = useSessionStore((s) => s.move);
  const attachMetas = useSessionStore((s) => s.attachMetas);
  const detachAttachment = useSessionStore((s) => s.detachAttachment);
  const setFilePath = useSessionStore((s) => s.setFilePath);
  const markSynced = useSessionStore((s) => s.markSynced);
  const touchRecent = useSessionStore((s) => s.touchRecent);

  const scheduleRescan = useCallback(() => {
    if (rescanTimer.current) window.clearTimeout(rescanTimer.current);
    rescanTimer.current = window.setTimeout(() => {
      rescanGlossaryLinks();
    }, 450);
  }, [rescanGlossaryLinks]);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );

  const hydrateAgentForTab = useCallback(
    async (
      tabId: string,
      filePath: string | null,
      fromFile?: AgentSession | AgentThread | null,
    ) => {
      await useAgentStore
        .getState()
        .openFromPackage(filePath, tabId, fromFile);
    },
    [],
  );

  useEffect(() => {
    if (!activeTab) return;
    void useAgentStore
      .getState()
      .activate(activeTab.filePath, activeTab.id);
  }, [activeTab?.id, activeTab?.filePath]);

  // 词表标题集合变化时补扫（例如 + 新建后改名、打开旧项目）
  const glossaryTermKey = useMemo(() => {
    if (!activeTab) return "";
    const titles: string[] = [];
    const walk = (nodes: typeof activeTab.project.glossary) => {
      for (const n of nodes) {
        titles.push(n.title, ...n.aliases);
        walk(n.children);
      }
    };
    walk(activeTab.project.glossary);
    return titles.join("\0");
  }, [activeTab]);

  useEffect(() => {
    if (!glossaryTermKey) return;
    scheduleRescan();
  }, [glossaryTermKey, scheduleRescan]);

  const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);

  const openFilePaths = useMemo(() => {
    const set = new Set<string>();
    for (const t of tabs) {
      if (t.filePath) set.add(t.filePath.replace(/\\/g, "/"));
    }
    return set;
  }, [tabs]);

  const hasDirty = tabs.some(tabNeedsCloseConfirm);

  const numberedTree = useMemo(() => {
    if (!activeTab) return [];
    return withNumbering(activeTab.project.tree);
  }, [activeTab]);

  const editTarget = useMemo(() => {
    if (!activeTab) return null;
    return getWorkspaceEditTarget(activeTab);
  }, [activeTab]);

  const selectedNode = useMemo(() => {
    if (!activeTab || !editTarget) return null;
    if (editTarget.scope === "glossary") {
      return {
        id: editTarget.id,
        title: editTarget.title,
        content: editTarget.content,
        children: [],
        attachments: [],
      };
    }
    return findNodeById(activeTab.project.tree, editTarget.id);
  }, [activeTab, editTarget]);

  const numberLabel = useMemo(() => {
    if (!activeTab || !editTarget || editTarget.scope !== "tree") return null;
    return getNumberById(activeTab.project.tree, editTarget.id);
  }, [activeTab, editTarget]);

  const hostGlossaryLinks = useMemo(() => {
    if (!activeTab || !editTarget) return [];
    return activeTab.project.glossaryLinks.filter(
      (l) => l.hostNodeId === editTarget.id,
    );
  }, [activeTab, editTarget]);

  const glossaryColors = useMemo(() => {
    if (!activeTab) return {};
    return collectGlossaryColors(activeTab.project.glossary);
  }, [activeTab]);

  const glossaryTitles = useMemo(() => {
    if (!activeTab) return {};
    return collectGlossaryTitles(
      activeTab.project.glossary,
      activeTab.project.tree,
    );
  }, [activeTab]);

  const glossaryBodies = useMemo(() => {
    if (!activeTab) return {};
    return collectGlossaryBodyPreviews(
      activeTab.project.glossary,
      activeTab.project.tree,
    );
  }, [activeTab]);

  /** 词条改名：只改标题，旧名进 aliases；不同步正文 */
  const requestGlossaryRename = useCallback(
    (entryId: string, nextTitle: string) => {
      renameGlossaryTerm(entryId, nextTitle);
    },
    [renameGlossaryTerm],
  );

  const handleTitleCommit = useCallback(
    (nextTitle: string) => {
      if (!activeTab || !editTarget) return;
      // 找对应词条：大纲节点可能有 ref；词表项自身
      let entryId: string | null = null;
      if (editTarget.scope === "glossary") {
        entryId = editTarget.id;
      } else {
        entryId =
          findGlossaryBySourceId(activeTab.project.glossary, editTarget.id)
            ?.id ?? null;
      }
      if (entryId) {
        requestGlossaryRename(entryId, nextTitle);
        return;
      }
      if (editTarget.scope === "tree") setTitle(editTarget.id, nextTitle);
      else setGlossaryTitle(editTarget.id, nextTitle);
    },
    [
      activeTab,
      editTarget,
      requestGlossaryRename,
      setTitle,
      setGlossaryTitle,
    ],
  );

  const doReferenceGlossary = useCallback(
    async (nodeId: string) => {
      const settings = await loadAppSettings();
      if (!settings.hideGlossaryRefTip) {
        setGlossaryRefTip({ nodeId, dontShow: false });
        return;
      }
      referenceAsGlossary(nodeId);
      scheduleRescan();
    },
    [referenceAsGlossary, scheduleRescan],
  );

  const openTemplate = (pluginId: string) => {
    const plugin = getPlugin(pluginId);
    if (!plugin) return;
    markLaunched();
    openProjectTab({ project: plugin.getInitialData() });
  };

  const openWango = async () => {
    try {
      const result = await openWangoFile();
      if (!result) return;
      markLaunched();
      const tabId = openProjectTab({
        project: result.project,
        filePath: result.path,
      });
      await hydrateAgentForTab(tabId, result.path, result.agent);
    } catch (err) {
      console.error(err);
      window.alert(
        err instanceof Error ? err.message : t("alert.openFailed"),
      );
    }
  };

  const openRecent = async (entry: RecentEntry) => {
    markLaunched();
    if (entry.filePath) {
      const norm = entry.filePath.replace(/\\/g, "/");
      const existing = tabs.find(
        (t) => t.filePath?.replace(/\\/g, "/") === norm,
      );
      if (existing) {
        selectTab(existing.id);
        return;
      }
      try {
        const { isTauriRuntime } = await import("@/desktop/draftStore");
        const { nativePathExists } = await import("@/desktop/nativeFs");
        if (!isTauriRuntime()) {
          window.alert(t("alert.browserOpen"));
          return;
        }
        if (!(await nativePathExists(entry.filePath))) {
          window.alert(t("alert.fileMissing"));
          return;
        }
        const loaded = await loadWangoFromPath(entry.filePath);
        const tabId = openProjectTab({
          project: loaded.project,
          filePath: loaded.path,
        });
        await hydrateAgentForTab(tabId, loaded.path, loaded.agent);
      } catch (err) {
        console.error(err);
        window.alert(
          err instanceof Error ? err.message : t("alert.openRecentFailed"),
        );
      }
      return;
    }

    if (entry.draftTabId) {
      const existing = tabs.find((t) => t.id === entry.draftTabId);
      if (existing) {
        selectTab(existing.id);
        return;
      }
      window.alert(t("alert.draftGone"));
    }
  };

  const bindPathAndSync = async (tab: ProjectTab, path: string) => {
    const prevPath = tab.filePath;
    setFilePath(tab.id, path);
    markSynced(tab.id, tab.revision);
    touchRecent({
      ...tab,
      filePath: path,
      syncedRevision: tab.revision,
    });
    const prevNorm = (prevPath ?? "").replace(/\\/g, "/");
    const nextNorm = path.replace(/\\/g, "/");
    // 首次落盘或另存/改路径：把本机 Agent 缓存迁到新路径键
    if (prevNorm !== nextNorm) {
      await useAgentStore.getState().remountKey(path, tab.id);
    }
    await flushSessionSave();
  };

  const saveTab = async (tab: ProjectTab): Promise<boolean> => {
    try {
      const path = await saveOrSaveAsWango(tab.project, tab.filePath);
      if (!path) return false;
      await bindPathAndSync(tab, path);
      return true;
    } catch (err) {
      console.error(err);
      window.alert(
        err instanceof Error ? err.message : t("alert.saveFailed"),
      );
      return false;
    }
  };

  const saveAsTab = async (
    tab: ProjectTab,
    opts?: { includeAgent?: boolean },
  ): Promise<boolean> => {
    try {
      const path = await saveWangoFile(tab.project, {
        defaultName: defaultWangoFileName(tab.project),
        defaultPath: tab.filePath,
        agent: opts?.includeAgent
          ? useAgentStore.getState().session
          : null,
      });
      if (!path) return false;
      await bindPathAndSync(tab, path);
      return true;
    } catch (err) {
      console.error(err);
      window.alert(
        err instanceof Error ? err.message : t("alert.saveAsFailed"),
      );
      return false;
    }
  };

  const requestCloseTab = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (!tabNeedsCloseConfirm(tab)) {
      removeTab(tabId);
      void flushSessionSave();
      return;
    }
    setPendingClose({ kind: "tab", tabId });
  };

  const runOpenedCloseAction = useCallback((action: OpenedCloseAction) => {
    const store = useSessionStore.getState();
    if (action.type === "one") store.closeOpenedPage(action.page);
    else if (action.type === "others") store.closeOtherOpenedPages(action.keep);
    else store.closeAllOpenedPages();
  }, []);

  const requestCloseOpenedPage = useCallback(
    (page: OpenedPage) => {
      const tab = useSessionStore.getState().getActiveTab();
      if (!tab) return;
      if (!openedPageNeedsSavePrompt(tab, page)) {
        closeOpenedPage(page);
        return;
      }
      setPendingClose({
        kind: "opened",
        action: { type: "one", page },
        title: resolveOpenedPageTitle(tab, page),
      });
    },
    [closeOpenedPage],
  );

  const requestCloseOtherOpenedPages = useCallback(
    (keep: OpenedPage) => {
      const tab = useSessionStore.getState().getActiveTab();
      if (!tab) return;
      const closing = (tab.openedPages ?? []).filter(
        (p) => !(p.scope === keep.scope && p.id === keep.id),
      );
      const needsPrompt = closing.some((p) =>
        openedPageNeedsSavePrompt(tab, p),
      );
      if (!needsPrompt) {
        closeOtherOpenedPages(keep);
        return;
      }
      setPendingClose({
        kind: "opened",
        action: { type: "others", keep },
        title: resolveOpenedPageTitle(tab, keep),
      });
    },
    [closeOtherOpenedPages],
  );

  const requestCloseAllOpenedPages = useCallback(() => {
    const tab = useSessionStore.getState().getActiveTab();
    if (!tab) return;
    const needsPrompt = (tab.openedPages ?? []).some((p) =>
      openedPageNeedsSavePrompt(tab, p),
    );
    if (!needsPrompt) {
      closeAllOpenedPages();
      return;
    }
    setPendingClose({
      kind: "opened",
      action: { type: "all" },
      title: displayTabTitle(tab),
    });
  }, [closeAllOpenedPages]);

  const runAppCloseQueue = useCallback(
    (queue: string[], resolve: (ok: boolean) => void) => {
      if (!queue.length) {
        resolve(true);
        return;
      }
      const [head, ...rest] = queue;
      const tab = useSessionStore.getState().tabs.find((t) => t.id === head);
      if (!tab || !tabNeedsCloseConfirm(tab)) {
        if (tab) useSessionStore.getState().removeTab(tab.id);
        runAppCloseQueue(rest, resolve);
        return;
      }
      setPendingClose({ kind: "app", queue: [head, ...rest], resolve });
    },
    [],
  );

  const requestAppClose = useCallback(async () => {
    const dirtyIds = useSessionStore
      .getState()
      .tabs.filter(tabNeedsCloseConfirm)
      .map((t) => t.id);
    if (!dirtyIds.length) {
      await flushSessionSave();
      return true;
    }
    return new Promise<boolean>((resolve) => {
      runAppCloseQueue(dirtyIds, resolve);
    });
  }, [runAppCloseQueue]);

  useWindowCloseGuard(hasDirty, requestAppClose);

  const onConfirmSave = async () => {
    if (!pendingClose) return;
    if (pendingClose.kind === "opened") {
      const tab = useSessionStore.getState().getActiveTab();
      if (!tab) {
        setPendingClose(null);
        return;
      }
      const ok = await saveTab(tab);
      if (!ok) return;
      runOpenedCloseAction(pendingClose.action);
      setPendingClose(null);
      void flushSessionSave();
      return;
    }
    if (pendingClose.kind === "tab") {
      const tab = tabs.find((t) => t.id === pendingClose.tabId);
      if (!tab) {
        setPendingClose(null);
        return;
      }
      const ok = await saveTab(tab);
      if (!ok) return;
      removeTab(tab.id);
      setPendingClose(null);
      void flushSessionSave();
      return;
    }
    const [head, ...rest] = pendingClose.queue;
    const tab = tabs.find((t) => t.id === head);
    const resolve = pendingClose.resolve;
    if (tab) {
      const ok = await saveTab(tab);
      if (!ok) return;
      removeTab(tab.id);
    }
    setPendingClose(null);
    runAppCloseQueue(rest, resolve);
  };

  const onConfirmDiscard = () => {
    if (!pendingClose) return;
    if (pendingClose.kind === "opened") {
      runOpenedCloseAction(pendingClose.action);
      setPendingClose(null);
      return;
    }
    if (pendingClose.kind === "tab") {
      removeTab(pendingClose.tabId);
      setPendingClose(null);
      void flushSessionSave();
      return;
    }
    const [head, ...rest] = pendingClose.queue;
    const resolve = pendingClose.resolve;
    removeTab(head);
    setPendingClose(null);
    runAppCloseQueue(rest, resolve);
  };

  const onConfirmCancel = () => {
    if (pendingClose?.kind === "app") pendingClose.resolve(false);
    setPendingClose(null);
  };

  const onSaveActive = async () => {
    if (!activeTab) return;
    await saveTab(activeTab);
  };

  const onExport = async (req: ExportRequest) => {
    if (!activeTab) return;
    try {
      if (req.kind === "wango-as") {
        await saveAsTab(activeTab, {
          includeAgent: Boolean(req.includeAgent),
        });
        return;
      }
      if (req.kind === "ai") {
        await exportMarkdownFile(
          activeTab.project,
          "ai",
          toAiMarkdown(activeTab.project.tree),
          activeTab.filePath,
        );
        return;
      }
      if (req.kind === "pdf") {
        const scope = req.scope ?? "project";
        const blob = await toLongPdf(activeTab.project, {
          scope,
          nodeId: activeTab.selectedId,
          numbering: req.numbering,
          hideGlossaryStyles: req.hideGlossaryStyles,
        });
        await exportLongPdfFile(
          activeTab.project,
          blob,
          activeTab.filePath,
          scope === "node" && activeTab.selectedId
            ? findNodeById(activeTab.project.tree, activeTab.selectedId)?.title
            : undefined,
        );
        return;
      }
      if (req.kind === "docx") {
        const scope = req.scope ?? "project";
        const blob = await toDocx(activeTab.project, {
          scope,
          nodeId: activeTab.selectedId,
          numbering: req.numbering,
        });
        await exportDocxFile(
          activeTab.project,
          blob,
          activeTab.filePath,
          scope === "node" && activeTab.selectedId
            ? findNodeById(activeTab.project.tree, activeTab.selectedId)?.title
            : undefined,
        );
        return;
      }
      if (req.kind === "images") {
        const mode = req.imageMode ?? "long";
        const imgOpts = { hideGlossaryStyles: req.hideGlossaryStyles };
        if (mode === "long") {
          const blob = await toLongTreePng(activeTab.project, imgOpts);
          await exportContentLongPngFile(
            activeTab.project,
            blob,
            activeTab.filePath,
          );
          return;
        }
        const items =
          mode === "batch-node"
            ? await toBatchNodePngs(activeTab.project, imgOpts)
            : await toBatchMajorPngs(activeTab.project, imgOpts);
        await exportContentPngBatch(
          activeTab.project,
          mode === "batch-node" ? "node" : "major",
          items,
          activeTab.filePath,
        );
        return;
      }
      const png = await toMindmapPng(activeTab.project);
      await exportMindmapPngFile(
        activeTab.project,
        png,
        activeTab.filePath,
      );
    } catch (err) {
      console.error(err);
      window.alert(
        err instanceof Error ? err.message : t("alert.exportFailed"),
      );
      throw err;
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (activeTab) void saveTab(activeTab);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTab]);

  const hotkeyHandlers = useMemo(
    () => ({
      addChild: () => {
        const tab = useSessionStore.getState().getActiveTab();
        if (!tab) return;
        addChildNode(tab.selectedId);
      },
      addSibling: () => {
        const tab = useSessionStore.getState().getActiveTab();
        if (!tab?.selectedId) return;
        addSiblingNode(tab.selectedId);
      },
      focusTree: () => focusZoneEl("tree"),
      focusEditor: () => focusZoneEl("editor"),
      focusGlossary: () => focusZoneEl("glossary"),
      selectPrev: () => {
        const tab = useSessionStore.getState().getActiveTab();
        if (!tab) return;
        const flat = flattenVisible(tab.project.tree, tab.collapsedIds);
        if (!flat.length) return;
        const cur = tab.selectedId
          ? flat.findIndex((x) => x.id === tab.selectedId)
          : -1;
        const next = cur <= 0 ? flat[0]! : flat[cur - 1]!;
        selectNode(next.id);
      },
      selectNext: () => {
        const tab = useSessionStore.getState().getActiveTab();
        if (!tab) return;
        const flat = flattenVisible(tab.project.tree, tab.collapsedIds);
        if (!flat.length) return;
        const cur = tab.selectedId
          ? flat.findIndex((x) => x.id === tab.selectedId)
          : -1;
        const next =
          cur < 0 || cur >= flat.length - 1
            ? flat[flat.length - 1]!
            : flat[cur + 1]!;
        selectNode(next.id);
      },
      promote: () => {
        const tab = useSessionStore.getState().getActiveTab();
        if (!tab?.selectedId) return;
        promote(tab.selectedId);
      },
      demote: () => {
        const tab = useSessionStore.getState().getActiveTab();
        if (!tab?.selectedId) return;
        demote(tab.selectedId);
      },
      toggleCollapse: () => {
        const tab = useSessionStore.getState().getActiveTab();
        if (!tab?.selectedId) return;
        const node = findNodeById(tab.project.tree, tab.selectedId);
        if (!node || node.children.length === 0) return;
        toggleCollapsed(tab.selectedId);
      },
      statsToggle: () => {
        window.dispatchEvent(
          new CustomEvent("wg:hotkey", { detail: "statsToggle" }),
        );
      },
    }),
    [
      addChildNode,
      addSiblingNode,
      selectNode,
      promote,
      demote,
      toggleCollapsed,
    ],
  );

  useAppHotkeys(Boolean(activeTab), hotkeyHandlers);

  const pendingTab =
    pendingClose?.kind === "tab"
      ? tabs.find((t) => t.id === pendingClose.tabId)
      : pendingClose?.kind === "app"
        ? tabs.find((t) => t.id === pendingClose.queue[0])
        : null;
  const pendingOpenedTitle =
    pendingClose?.kind === "opened" ? pendingClose.title : null;

  if (!hydrated) {
    return <div className="wg-boot">{t("app.boot")}</div>;
  }

  const editorMode = Boolean(activeTab);

  return (
    <>
      <TwoPane
        activeTabId={activeTabId}
        agentOpen={agentOpen}
        onAgentOpenChange={(open) => {
          setAgentOpen(open);
          const cur = getAppSettings();
          void saveAppSettings({ ...cur, agentPaneOpen: open });
        }}
        onAgentVisibleChange={setAgentVisible}
        agentToggleRequest={agentToggleRequest}
        header={
          <Header
            editorMode={editorMode}
            projectName={activeTab?.project.name ?? ""}
            onProjectNameChange={setProjectName}
            recents={recents}
            openFilePaths={openFilePaths}
            onOpenRecent={(e) => void openRecent(e)}
            onRemoveRecent={(e) => setPendingRecentRemove(e)}
            onNewFromTemplate={openTemplate}
            onPasteImport={() => setPasteImportOpen(true)}
            onFileImport={() => void onFileImport()}
            onImport={() => void openWango()}
            onSave={() => void onSaveActive()}
            onOpenExport={() => setExportOpen(true)}
            onOpenSettings={() => void openSettings()}
            agentOpen={agentVisible}
            onToggleAgent={() => setAgentToggleRequest((n) => n + 1)}
            onInspireGate={onInspireGate}
            onInspireMode={onInspireMode}
            inspirePhase={inspirePhase}
            onInspireCancel={cancelInspire}
            saveError={saveError}
          />
        }
        tabBar={
          <ProjectTabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={selectTab}
            onClose={requestCloseTab}
            onRename={renameTabProject}
          />
        }
        fullPage={
          !activeTab ? (
            <HomeView
              mode={homeMode}
              recents={recents}
              onOpenTemplate={openTemplate}
              onOpenRecent={(e) => void openRecent(e)}
              onRemoveRecent={(e) => setPendingRecentRemove(e)}
              onOpenFile={() => void openWango()}
            />
          ) : undefined
        }
        tree={
          activeTab ? (
            <LeftRail
              tree={
                <TreePane
                  locateKey={activeTab.id}
                  nodes={numberedTree}
                  sourceTree={activeTab.project.tree}
                  selectedId={
                    activeTab.selectionScope === "tree"
                      ? activeTab.selectedId
                      : null
                  }
                  collapsedIds={activeTab.collapsedIds}
                  searchQuery={activeTab.searchQuery}
                  onSearchChange={setSearchQuery}
                  onSelect={selectNode}
                  onToggle={toggleCollapsed}
                  onExpandNodes={expandNodes}
                  onMove={move}
                  onAddChild={(parentId) => addChildNode(parentId)}
                  onAddSibling={(afterId) => addSiblingNode(afterId)}
                  onCopy={(id) => copyTreeNode(id)}
                  onPaste={(afterId) => pasteTreeNode(afterId)}
                  canPaste={Boolean(treeClipboard)}
                  onPromote={() => {
                    if (activeTab.selectedId) promote(activeTab.selectedId);
                  }}
                  onDemote={() => {
                    if (activeTab.selectedId) demote(activeTab.selectedId);
                  }}
                  onReleaseChildren={(id) => releaseChildren(id)}
                  onDissolve={(id) => dissolveNode(id)}
                  onDelete={(id) => deleteNode(id)}
                  onRename={(id, title) => setTitle(id, title)}
                  onSetPriority={(id, priority) => setNodePriority(id, priority)}
                  onSetLabels={(id, labels) => setNodeLabels(id, labels)}
                  onReferenceGlossary={(id) => void doReferenceGlossary(id)}
                  onCopyGlossary={(id) => {
                    copyAsGlossary(id);
                    scheduleRescan();
                  }}
                  isReferencedAsGlossary={(id) =>
                    collectRefsToSource(activeTab.project.glossary, id).length >
                    0
                  }
                />
              }
              glossary={
                <GlossaryPane
                  glossary={activeTab.project.glossary}
                  tree={activeTab.project.tree}
                  selectedId={activeTab.glossarySelectedId}
                  collapsedIds={activeTab.glossaryCollapsedIds}
                  onSelect={selectGlossary}
                  onToggle={toggleGlossaryCollapsed}
                  onAddRoot={() => addGlossaryChildNode(null)}
                  onAddChild={(parentId) => addGlossaryChildNode(parentId)}
                  onDelete={deleteGlossaryEntry}
                  onMove={moveGlossary}
                  onSaveAliases={(id, list) => {
                    setGlossaryAliases(id, list);
                  }}
                  onRename={requestGlossaryRename}
                  onSetColor={setGlossaryColor}
                  resolvedColors={glossaryColors}
                  onOpenLogs={(entryId) => setLogPanel({ entryId })}
                />
              }
            />
          ) : undefined
        }
        workspace={
          activeTab ? (
            <WorkspacePane
              node={selectedNode}
              numberLabel={numberLabel}
              numberedTree={numberedTree}
              projectTab={activeTab}
              openedActive={
                editTarget
                  ? { scope: editTarget.scope, id: editTarget.id }
                  : null
              }
              onOpenWorkspacePage={openWorkspacePage}
              onCloseOpenedPage={requestCloseOpenedPage}
              onCloseOtherOpenedPages={requestCloseOtherOpenedPages}
              onCloseAllOpenedPages={requestCloseAllOpenedPages}
              contentStreaming={Boolean(
                inspirePhase !== "idle" &&
                  inspireTabId &&
                  activeTabId === inspireTabId,
              )}
              glossaryLinks={hostGlossaryLinks}
              glossaryColors={glossaryColors}
              glossaryTitles={glossaryTitles}
              glossaryBodies={glossaryBodies}
              onGlossaryPeek={({ entryIds, primaryId, clientX, clientY }) => {
                const x = Math.min(clientX + 12, window.innerWidth - 400);
                const y = Math.min(clientY + 12, window.innerHeight - 200);
                setGlossaryPeek((prev) => {
                  const merged = mergePeekTabs(
                    prev?.tabs ?? [],
                    entryIds,
                    primaryId,
                  );
                  return {
                    tabs: merged.tabs,
                    activeId: merged.activeId,
                    x: prev ? prev.x : Math.max(8, x),
                    y: prev ? prev.y : Math.max(8, y),
                  };
                });
              }}
              onGlossaryOpen={(entryId) => selectGlossary(entryId)}
              onBindGlossary={(sel) =>
                setGlossaryPicker({ mode: "bind", sel })
              }
              onCreateGlossaryChild={(sel) =>
                setGlossaryPicker({ mode: "childParent", sel })
              }
              onUnbindGlossary={(sel) => {
                if (!editTarget) return;
                const needle = sel.text.trim();
                const hits = activeTab.project.glossaryLinks.filter((l) => {
                  if (l.hostNodeId !== editTarget.id) return false;
                  if (!isManualLink(l) || l.status !== "active") return false;
                  if ((l.anchorText || l.matchedText || "").trim() !== needle) {
                    return false;
                  }
                  if (
                    l.occurrenceIndex != null &&
                    l.occurrenceIndex !== sel.occurrenceIndex
                  ) {
                    return false;
                  }
                  return true;
                });
                for (const l of hits) removeGlossaryLink(l.id);
              }}
              onUnbindGlossaryLink={(linkId) => removeGlossaryLink(linkId)}
              onTitleChange={handleTitleCommit}
              onContentChange={(md) => {
                if (!editTarget) return;
                if (editTarget.scope === "tree") setContent(editTarget.id, md);
                else setGlossaryContent(editTarget.id, md);
                scheduleRescan();
              }}
              onAttachFiles={(metas) => {
                // 附件只挂在大纲节点上；词表 copy/local 暂不支持附件
                if (editTarget?.scope === "tree" && metas.length) {
                  attachMetas(editTarget.id, metas);
                }
              }}
              onOpenAttachment={async (meta: AttachmentMeta) => {
                try {
                  await openStagedAttachment(meta);
                } catch (err) {
                  console.error(err);
                  window.alert(
                    err instanceof Error
                      ? err.message
                      : t("alert.openAttachFailed"),
                  );
                }
              }}
              onRemoveAttachment={async (meta: AttachmentMeta) => {
                if (editTarget?.scope !== "tree") return;
                const removed = detachAttachment(editTarget.id, meta.id);
                if (!removed) return;
                try {
                  await removeStagedAttachment(removed);
                } catch (err) {
                  console.error(err);
                }
              }}
            />
          ) : undefined
        }
        agent={
          activeTab ? (
            <AgentPane
              project={activeTab.project}
              focus={
                editTarget
                  ? {
                      scope: editTarget.scope,
                      id: editTarget.id,
                      title: editTarget.title,
                    }
                  : null
              }
              onOpenSettings={() => void openSettings()}
              onApplyProposal={(p) => {
                if (p.op === "addChild") {
                  if (p.target === "tree") {
                    if (!p.parentId) return false;
                    const id = addChildNodeWithContent(
                      p.parentId,
                      p.title,
                      p.content,
                    );
                    return id ?? false;
                  }
                  const id = addGlossaryChildWithContent(
                    p.parentId,
                    p.title,
                    p.content ?? "",
                  );
                  return id ?? false;
                }
                if (p.target === "tree") {
                  if (!findNodeById(activeTab.project.tree, p.nodeId)) {
                    return false;
                  }
                  if (p.field === "title") setTitle(p.nodeId, p.next);
                  else setContent(p.nodeId, p.next);
                  rescanGlossaryLinks();
                  return p.nodeId;
                }
                const entry = findGlossaryById(
                  activeTab.project.glossary,
                  p.nodeId,
                );
                if (!entry || entry.kind === "ref") return false;
                if (p.field === "title") setGlossaryTitle(p.nodeId, p.next);
                else setGlossaryContent(p.nodeId, p.next);
                rescanGlossaryLinks();
                return p.nodeId;
              }}
            />
          ) : undefined
        }
      />
      {exportOpen && activeTab && (
        <ExportDialog
          hasSelection={Boolean(activeTab.selectedId)}
          onCancel={() => setExportOpen(false)}
          onExport={onExport}
        />
      )}
      {pendingRecentRemove && (
        <RecentRemoveDialog
          entry={pendingRecentRemove}
          onCancel={() => setPendingRecentRemove(null)}
          onRemoveFromList={() => {
            useSessionStore.getState().removeRecent(pendingRecentRemove.key);
            setPendingRecentRemove(null);
          }}
          onDeleteForever={() => {
            void (async () => {
              const entry = pendingRecentRemove;
              try {
                if (entry.filePath) {
                  await nativeDeleteFile(entry.filePath);
                  const norm = entry.filePath.replace(/\\/g, "/");
                  const open = useSessionStore
                    .getState()
                    .tabs.filter(
                      (tab) =>
                        tab.filePath?.replace(/\\/g, "/") === norm,
                    );
                  for (const tab of open) {
                    useSessionStore.getState().removeTab(tab.id);
                  }
                } else if (entry.draftTabId) {
                  const still = useSessionStore
                    .getState()
                    .tabs.find((tab) => tab.id === entry.draftTabId);
                  if (still) useSessionStore.getState().removeTab(still.id);
                }
                useSessionStore.getState().removeRecent(entry.key);
                setPendingRecentRemove(null);
              } catch (err) {
                console.error(err);
                window.alert(
                  err instanceof Error
                    ? err.message
                    : t("alert.deleteRecentFailed"),
                );
              }
            })();
          }}
        />
      )}
      {(pendingTab || pendingOpenedTitle) && (
        <CloseConfirmDialog
          title={
            pendingOpenedTitle ?? displayTabTitle(pendingTab!)
          }
          body={
            pendingOpenedTitle ? t("close.openedBody") : undefined
          }
          onSave={() => void onConfirmSave()}
          onDiscard={onConfirmDiscard}
          onCancel={onConfirmCancel}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          initial={settingsSnapshot}
          onCancel={() => setSettingsOpen(false)}
          onSave={async (draft: SettingsDraft) => {
            try {
              setLocale(draft.locale);
              const next = await saveAppSettings({
                apiBaseUrl: draft.apiBaseUrl,
                apiKey: draft.apiKey,
                model: draft.model,
                hideExportWatermark: draft.hideExportWatermark,
                defaultExportDir: draft.defaultExportDir,
                hideGlossaryRefTip: settingsSnapshot.hideGlossaryRefTip,
                glossaryPaneRatio: settingsSnapshot.glossaryPaneRatio,
                treePaneWidth: settingsSnapshot.treePaneWidth,
                treePaneCollapsed: settingsSnapshot.treePaneCollapsed,
                agentPaneOpen: settingsSnapshot.agentPaneOpen,
                agentPaneWidth: settingsSnapshot.agentPaneWidth,
                hotkeys: draft.hotkeys,
              });
              setSettingsSnapshot(next);
              setSettingsOpen(false);
            } catch (err) {
              window.alert(
                err instanceof Error ? err.message : t("settings.saveFailed"),
              );
            }
          }}
        />
      )}
      {inspirePrompt && (
        <InspirePromptDialog
          mode={inspirePrompt}
          onCancel={() => setInspirePrompt(null)}
          onSubmit={(text) => {
            const mode = inspirePrompt;
            setInspirePrompt(null);
            if (mode === "sentence") {
              void runInspireStream((signal) =>
                inspireFromSentenceStream(text, { signal }),
              );
            } else {
              void runInspireStream((signal) =>
                inspireOutlineOnlyStream(text, { signal }),
              );
            }
          }}
        />
      )}
      {pasteImportOpen && (
        <PasteImportDialog
          onCancel={() => setPasteImportOpen(false)}
          onCommit={onPasteImportCommit}
          onOpenSettings={() => void openSettings()}
        />
      )}
      {fileImportPayload && (
        <OutlineFileImportDialog
          fileName={fileImportPayload.fileName}
          kind={fileImportPayload.kind}
          text={fileImportPayload.text}
          bytes={fileImportPayload.bytes}
          onCancel={() => setFileImportPayload(null)}
          onCommit={(root) => {
            setFileImportPayload(null);
            openNewFromOutlineRoot(root);
          }}
        />
      )}
      {inspirePreparing && inspirePhase === "generating" && (
        <InspireBusy
          phase="prepare"
          thinking={inspireThinking}
          onCancel={cancelInspire}
        />
      )}

      {/* 首次「引用为词条」防懵提示；偏好只写本机 settings，不进 .wango */}
      {glossaryRefTip ? (
        <div
          className={glossaryDlg.backdrop}
          role="presentation"
          onClick={() => setGlossaryRefTip(null)}
        >
          <div
            className={glossaryDlg.panel}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={glossaryDlg.title}>{t("glossary.refTipTitle")}</h2>
            <p className={glossaryDlg.body}>{t("glossary.refTipBody")}</p>
            <label className={glossaryDlg.checkRow}>
              <input
                type="checkbox"
                checked={glossaryRefTip.dontShow}
                onChange={(e) =>
                  setGlossaryRefTip({
                    ...glossaryRefTip,
                    dontShow: e.target.checked,
                  })
                }
              />
              {t("glossary.refTipDontShow")}
            </label>
            <div className={glossaryDlg.actions}>
              <button
                type="button"
                className={glossaryDlg.primary}
                onClick={() => {
                  void (async () => {
                    if (glossaryRefTip.dontShow) {
                      const cur = await loadAppSettings();
                      const next = await saveAppSettings({
                        ...cur,
                        hideGlossaryRefTip: true,
                      });
                      setSettingsSnapshot(next);
                    }
                    referenceAsGlossary(glossaryRefTip.nodeId);
                    setGlossaryRefTip(null);
                    scheduleRescan();
                  })();
                }}
              >
                {t("glossary.refTipOk")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {glossaryPeek && activeTab ? (
        <GlossaryPeekPanel
          project={activeTab.project}
          tabIds={glossaryPeek.tabs}
          activeId={glossaryPeek.activeId}
          x={glossaryPeek.x}
          y={glossaryPeek.y}
          onActivate={(id) =>
            setGlossaryPeek((p) => (p ? { ...p, activeId: id } : p))
          }
          onCloseTab={(id) => {
            setGlossaryPeek((p) => {
              if (!p) return p;
              const tabs = p.tabs.filter((t) => t !== id);
              if (!tabs.length) return null;
              const activeId =
                p.activeId === id ? tabs[tabs.length - 1]! : p.activeId;
              return { ...p, tabs, activeId };
            });
          }}
          onClose={() => setGlossaryPeek(null)}
          onOpenInGlossary={(id) => {
            selectGlossary(id);
          }}
          onJumpHost={(hostNodeId) => {
            if (findNodeById(activeTab.project.tree, hostNodeId)) {
              selectNode(hostNodeId);
            } else {
              selectGlossary(hostNodeId);
            }
          }}
        />
      ) : null}

      {logPanel && activeTab ? (
        <GlossaryLogPanel
          project={activeTab.project}
          entryId={logPanel.entryId}
          logKind="ref"
          onClose={() => setLogPanel(null)}
          onJump={(hostNodeId) => {
            // host 可能是大纲节点，也可能是词表 copy/local 自身 id
            if (findNodeById(activeTab.project.tree, hostNodeId)) {
              selectNode(hostNodeId);
            } else {
              selectGlossary(hostNodeId);
            }
          }}
          onRemoveLink={removeGlossaryLink}
          onRestoreLink={restoreGlossaryLink}
          onClearBlacklist={clearBlacklistBlock}
          onConfirmAuto={confirmGlossaryAutoLink}
          onUndoEdit={undoGlossaryEditLog}
        />
      ) : null}

      {glossaryPicker && activeTab ? (
        <GlossaryPickerDialog
          glossary={activeTab.project.glossary}
          tree={activeTab.project.tree}
          mode={glossaryPicker.mode === "bind" ? "multi" : "single"}
          allowRoot={glossaryPicker.mode === "childParent"}
          title={
            glossaryPicker.mode === "bind"
              ? t("glossary.pickerBindTitle")
              : t("glossary.pickerChildTitle")
          }
          confirmLabel={
            glossaryPicker.mode === "bind"
              ? t("glossary.pickerBindConfirm")
              : t("glossary.pickerChildConfirm")
          }
          onCancel={() => setGlossaryPicker(null)}
          onConfirm={(ids) => {
            const sel = glossaryPicker.sel;
            const hostNodeId =
              editTarget?.id ??
              activeTab.selectedId ??
              activeTab.glossarySelectedId;
            if (!hostNodeId) {
              setGlossaryPicker(null);
              return;
            }
            if (glossaryPicker.mode === "bind") {
              bindGlossaryManual({
                hostNodeId,
                text: sel.text,
                occurrenceIndex: sel.occurrenceIndex,
                entryIds: ids,
              });
            } else {
              const parentId = ids[0] ?? null;
              const id = addGlossaryChildWithContent(
                parentId,
                sel.text.trim().slice(0, 80) || t("glossary.untitled"),
                sel.text,
              );
              if (id) {
                bindGlossaryManual({
                  hostNodeId,
                  text: sel.text,
                  occurrenceIndex: sel.occurrenceIndex,
                  entryIds: [id],
                });
              }
            }
            setGlossaryPicker(null);
          }}
        />
      ) : null}
    </>
  );
}
