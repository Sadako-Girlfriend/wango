/**
 * 应用壳：多项目选项卡 + 首页；打开/模板只加 tab。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  findNodeById,
  getNumberById,
  withNumbering,
} from "@/domain";
import {
  toAiMarkdown,
  toBatchMajorPngs,
  toBatchNodePngs,
  toLongPdf,
  toLongTreePng,
  toMindmapPng,
} from "@/export";
import { getPlugin } from "@/plugins";
import {
  displayTabTitle,
  tabNeedsCloseConfirm,
  useSessionStore,
  type ProjectTab,
} from "@/store/sessionStore";
import type { RecentEntry } from "@/desktop/sessionPersist";
import { InspireSessionApplier } from "@/ai/inspireApply";
import {
  inspireFromSentenceStream,
  inspireOutlineOnlyStream,
  inspireRefineStream,
} from "@/ai/inspireStream";
import type { InspireEvent } from "@/ai/inspireProtocol";
import { ensureApiSettings, isApiConfigured } from "@/ai/openaiCompat";
import {
  emptyAppSettings,
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
} from "@/desktop/appSettings";
import {
  openStagedAttachment,
  removeStagedAttachment,
} from "@/desktop/attachmentBridge";
import { setLocale } from "@/i18n";
import {
  exportContentLongPngFile,
  exportContentPngBatch,
  exportLongPdfFile,
  exportMarkdownFile,
  exportMindmapPngFile,
  loadWangoFromPath,
  openWangoFile,
  saveOrSaveAsWango,
  saveWangoFile,
} from "@/desktop/fileBridge";
import { nativeDeleteFile } from "@/desktop/nativeFs";
import { defaultWangoFileName } from "@/desktop/pathUtils";
import type { AttachmentMeta, ProjectData } from "@/domain";
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
  SettingsDialog,
  type SettingsDraft,
} from "@/ui/layout/SettingsDialog";
import { TreePane } from "@/ui/tree/TreePane";
import { WorkspacePane } from "@/ui/workspace/WorkspacePane";
import { HomeView } from "@/ui/home/HomeView";
import { t } from "@/i18n";
import {
  flushSessionSave,
  useSessionLifecycle,
  useWindowCloseGuard,
} from "./useSessionLifecycle";

type PendingClose =
  | { kind: "tab"; tabId: string }
  | { kind: "app"; queue: string[]; resolve: (ok: boolean) => void };

export function App() {
  const hydrated = useSessionLifecycle();
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const homeMode = useSessionStore((s) => s.homeMode);
  const recents = useSessionStore((s) => s.recents);
  const saveError = useSessionStore((s) => s.saveError);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
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
  const [inspireTabId, setInspireTabId] = useState<string | null>(null);
  const [inspirePrompt, setInspirePrompt] = useState<
    null | "sentence" | "outline"
  >(null);
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
        project: { name: t("inspire.generating"), tree: [] },
      });
      setInspireTabId(tabId);
      setInspirePhase("generating");
      setInspirePreparing(true);

      const applier = new InspireSessionApplier(tabId);
      let sawTerminal = false;

      try {
        for await (const ev of factory(ac.signal)) {
          if (ac.signal.aborted) break;
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
  const toggleCollapsed = useSessionStore((s) => s.toggleCollapsed);
  const setSearchQuery = useSessionStore((s) => s.setSearchQuery);
  const expandNodes = useSessionStore((s) => s.expandNodes);
  const setProjectName = useSessionStore((s) => s.setProjectName);
  const renameTabProject = useSessionStore((s) => s.renameTabProject);
  const setTitle = useSessionStore((s) => s.setTitle);
  const setContent = useSessionStore((s) => s.setContent);
  const addChildNode = useSessionStore((s) => s.addChildNode);
  const addSiblingNode = useSessionStore((s) => s.addSiblingNode);
  const copyTreeNode = useSessionStore((s) => s.copyTreeNode);
  const pasteTreeNode = useSessionStore((s) => s.pasteTreeNode);
  const treeClipboard = useSessionStore((s) => s.treeClipboard);
  const setNodePriority = useSessionStore((s) => s.setNodePriority);
  const setNodeLabels = useSessionStore((s) => s.setNodeLabels);
  const deleteNode = useSessionStore((s) => s.deleteNode);
  const promote = useSessionStore((s) => s.promote);
  const demote = useSessionStore((s) => s.demote);
  const move = useSessionStore((s) => s.move);
  const attachMetas = useSessionStore((s) => s.attachMetas);
  const detachAttachment = useSessionStore((s) => s.detachAttachment);
  const setFilePath = useSessionStore((s) => s.setFilePath);
  const markSynced = useSessionStore((s) => s.markSynced);
  const touchRecent = useSessionStore((s) => s.touchRecent);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );

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

  const selectedNode = useMemo(() => {
    if (!activeTab?.selectedId) return null;
    return findNodeById(activeTab.project.tree, activeTab.selectedId);
  }, [activeTab]);

  const numberLabel = useMemo(() => {
    if (!activeTab?.selectedId) return null;
    return getNumberById(activeTab.project.tree, activeTab.selectedId);
  }, [activeTab]);

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
      openProjectTab({ project: result.project, filePath: result.path });
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
        openProjectTab({
          project: loaded.project,
          filePath: loaded.path,
        });
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
    setFilePath(tab.id, path);
    markSynced(tab.id, tab.revision);
    touchRecent({
      ...tab,
      filePath: path,
      syncedRevision: tab.revision,
    });
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

  const saveAsTab = async (tab: ProjectTab): Promise<boolean> => {
    try {
      const path = await saveWangoFile(tab.project, {
        defaultName: defaultWangoFileName(tab.project),
        defaultPath: tab.filePath,
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
        await saveAsTab(activeTab);
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
      if (req.kind === "images") {
        const mode = req.imageMode ?? "long";
        if (mode === "long") {
          const blob = await toLongTreePng(activeTab.project);
          await exportContentLongPngFile(
            activeTab.project,
            blob,
            activeTab.filePath,
          );
          return;
        }
        const items =
          mode === "batch-node"
            ? await toBatchNodePngs(activeTab.project)
            : await toBatchMajorPngs(activeTab.project);
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

  const pendingTab =
    pendingClose?.kind === "tab"
      ? tabs.find((t) => t.id === pendingClose.tabId)
      : pendingClose?.kind === "app"
        ? tabs.find((t) => t.id === pendingClose.queue[0])
        : null;

  if (!hydrated) {
    return <div className="wg-boot">{t("app.boot")}</div>;
  }

  const editorMode = Boolean(activeTab);

  return (
    <>
      <TwoPane
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
            onImport={() => void openWango()}
            onSave={() => void onSaveActive()}
            onOpenExport={() => setExportOpen(true)}
            onOpenSettings={() => void openSettings()}
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
            <TreePane
              locateKey={activeTab.id}
              nodes={numberedTree}
              sourceTree={activeTab.project.tree}
              selectedId={activeTab.selectedId}
              collapsedIds={activeTab.collapsedIds}
              searchQuery={activeTab.searchQuery}
              onSearchChange={setSearchQuery}
              onSelect={selectNode}
              onToggle={toggleCollapsed}
              onExpandNodes={expandNodes}
              onMove={move}
              onAddChild={(parentId) => addChildNode(parentId)}
              onAddSibling={() => {
                if (activeTab.selectedId) addSiblingNode(activeTab.selectedId);
              }}
              onCopy={(id) => copyTreeNode(id)}
              onPaste={(afterId) => pasteTreeNode(afterId)}
              canPaste={Boolean(treeClipboard)}
              onPromote={() => {
                if (activeTab.selectedId) promote(activeTab.selectedId);
              }}
              onDemote={() => {
                if (activeTab.selectedId) demote(activeTab.selectedId);
              }}
              onDelete={(id) => deleteNode(id)}
              onSetPriority={(id, priority) => setNodePriority(id, priority)}
              onSetLabels={(id, labels) => setNodeLabels(id, labels)}
            />
          ) : undefined
        }
        workspace={
          activeTab ? (
            <WorkspacePane
              node={selectedNode}
              numberLabel={numberLabel}
              numberedTree={numberedTree}
              contentStreaming={Boolean(
                inspirePhase !== "idle" &&
                  inspireTabId &&
                  activeTabId === inspireTabId,
              )}
              onTitleChange={(title) => {
                if (activeTab.selectedId) setTitle(activeTab.selectedId, title);
              }}
              onContentChange={(md) => {
                if (activeTab.selectedId) setContent(activeTab.selectedId, md);
              }}
              onAttachFiles={(metas) => {
                if (activeTab.selectedId && metas.length) {
                  attachMetas(activeTab.selectedId, metas);
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
                if (!activeTab.selectedId) return;
                const removed = detachAttachment(
                  activeTab.selectedId,
                  meta.id,
                );
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
      {pendingTab && (
        <CloseConfirmDialog
          title={displayTabTitle(pendingTab)}
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
      {inspirePreparing && inspirePhase === "generating" && (
        <InspireBusy phase="prepare" />
      )}
    </>
  );
}
