/**
 * 右侧工作区：图片进正文；txt/json/py 等进代码块；其它走附件栏。
 * 桌面端同时接 Tauri 原生拖放 + HTML5 兜底（部分环境原生事件会失效）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorView, type EditorHandle, type WandCapture } from "@/editor";
import {
  analyzeScope,
  analyzeSelection,
  type AttachmentMeta,
  type NumberedTreeNode,
  type StatsScope,
  type TreeNode,
} from "@/domain";
import {
  pickAndStage,
  stageBrowserFiles,
  stageLocalPaths,
  type StageResult,
} from "@/desktop/attachmentBridge";
import { useTauriFileDrop } from "@/desktop/useTauriFileDrop";
import { isApiConfigured, ensureApiSettings } from "@/ai/openaiCompat";
import {
  formatTreeTitleOutline,
  wandRewrite,
} from "@/ai/wandRewrite";
import { t } from "@/i18n";
import { useI18n } from "@/i18n/useI18n";
import type { OpenedPage, ProjectTab } from "@/store/sessionStore";
import { AttachmentBar } from "./AttachmentBar";
import { ContentStatsPanel } from "./ContentStatsPanel";
import { WandConfirmDialog, WandIdeaDialog } from "./WandDialogs";
import { WorkspaceOpenTabs } from "./WorkspaceOpenTabs";
import styles from "./WorkspacePane.module.css";

interface WorkspacePaneProps {
  node: TreeNode | null;
  numberLabel: string | null;
  /** 编号树：魔法棒上下文用全树标题大纲 */
  numberedTree: NumberedTreeNode[];
  /** 当前项目 tab：用于「已打开」页签 */
  projectTab?: ProjectTab | null;
  openedActive?: OpenedPage | null;
  onOpenWorkspacePage?: (page: OpenedPage) => void;
  onCloseOpenedPage?: (page: OpenedPage) => void;
  onCloseOtherOpenedPages?: (page: OpenedPage) => void;
  onCloseAllOpenedPages?: () => void;
  onTitleChange: (title: string) => void;
  onContentChange: (markdown: string) => void;
  /** 灵感生成中：正文只读 + 外推打字机 */
  contentStreaming?: boolean;
  /** Agent 应用前：正文红绿预览（覆盖显示，不写 store） */
  diffPreviewMarkdown?: string | null;
  glossaryLinks?: import("@/domain").GlossaryLink[];
  glossaryColors?: Record<string, string>;
  glossaryTitles?: Record<string, string>;
  glossaryBodies?: Record<string, string>;
  onGlossaryEntryClick?: (entryId: string) => void;
  onGlossaryPeek?: (detail: {
    entryIds: string[];
    primaryId: string;
    clientX: number;
    clientY: number;
  }) => void;
  onGlossaryOpen?: (entryId: string) => void;
  onBindGlossary?: (
    sel: import("@/editor/EditorView").GlossaryEditorSelection,
  ) => void;
  onCreateGlossaryChild?: (
    sel: import("@/editor/EditorView").GlossaryEditorSelection,
  ) => void;
  onUnbindGlossary?: (
    sel: import("@/editor/EditorView").GlossaryEditorSelection,
  ) => void;
  onUnbindGlossaryLink?: (linkId: string) => void;
  onAttachFiles: (metas: AttachmentMeta[]) => void;
  onOpenAttachment: (meta: AttachmentMeta) => void;
  onRemoveAttachment: (meta: AttachmentMeta) => void;
}

type WandPhase =
  | { step: "idea"; capture: WandCapture; scopeHint: string }
  | {
      step: "confirm";
      capture: WandCapture;
      scopeHint: string;
      idea: string;
    }
  | null;

export function WorkspacePane({
  node,
  numberLabel,
  numberedTree,
  projectTab = null,
  openedActive = null,
  onOpenWorkspacePage,
  onCloseOpenedPage,
  onCloseOtherOpenedPages,
  onCloseAllOpenedPages,
  onTitleChange,
  onContentChange,
  contentStreaming = false,
  diffPreviewMarkdown = null,
  glossaryLinks = [],
  glossaryColors,
  glossaryTitles,
  glossaryBodies,
  onGlossaryEntryClick,
  onGlossaryPeek,
  onGlossaryOpen,
  onBindGlossary,
  onCreateGlossaryChild,
  onUnbindGlossary,
  onUnbindGlossaryLink,
  onAttachFiles,
  onOpenAttachment,
  onRemoveAttachment,
}: WorkspacePaneProps) {
  const { t: tr } = useI18n();
  const editorRef = useRef<EditorHandle>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [wandPhase, setWandPhase] = useState<WandPhase>(null);
  const [wandBusy, setWandBusy] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsScope, setStatsScope] = useState<StatsScope>("nodeOnly");
  const [selectionSnap, setSelectionSnap] = useState<{
    text: string;
    block: "text" | "code" | "callout";
  } | null>(null);
  const dragDepth = useRef(0);
  const busyRef = useRef(false);
  const nodeRef = useRef(node);
  nodeRef.current = node;
  const prevNodeIdRef = useRef<string | null>(null);
  /** 防止原生 drop 与 HTML5 drop 短时间双触发 */
  const lastDropAt = useRef(0);

  useEffect(() => {
    const id = node?.id ?? null;
    const prev = prevNodeIdRef.current;
    prevNodeIdRef.current = id;
    if (!id || prev === id) return;
    setEditingTitle(false);
    setWandPhase(null);
    setStatsOpen(false);
    setSelectionSnap(null);
  }, [node?.id]);

  useEffect(() => {
    if (!editingTitle) return;
    const el = titleInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editingTitle]);

  const commitTitle = useCallback(() => {
    if (!node) return;
    const next = titleDraft.trim() || tr("editor.nodeUntitled");
    if (next !== node.title) onTitleChange(next);
    setEditingTitle(false);
  }, [node, titleDraft, onTitleChange, tr]);

  const applyStage = useCallback(
    (result: StageResult) => {
      for (const img of result.images) {
        editorRef.current?.insertImage(img.displayUrl, img.name);
      }
      for (const text of result.texts) {
        editorRef.current?.insertCodeFile(
          text.name,
          text.language,
          text.content,
        );
      }
      if (result.files.length) onAttachFiles(result.files);
    },
    [onAttachFiles],
  );

  const beginDrop = () => {
    const now = Date.now();
    if (now - lastDropAt.current < 400) return false;
    if (busyRef.current) return false;
    if (!nodeRef.current) {
      window.alert(t("alert.selectNodeFirst"));
      return false;
    }
    lastDropAt.current = now;
    busyRef.current = true;
    return true;
  };

  const ingestPaths = useCallback(
    async (paths: string[]) => {
      if (!paths.length || !beginDrop()) return;
      try {
        const result = await stageLocalPaths(paths);
        if (
          !result.images.length &&
          !result.files.length &&
          !result.texts.length
        ) {
          window.alert(t("alert.dropReadFailed"));
          return;
        }
        applyStage(result);
      } catch (err) {
        console.error(err);
        window.alert(
          err instanceof Error ? err.message : t("alert.addFileFailed"),
        );
      } finally {
        busyRef.current = false;
      }
    },
    [applyStage],
  );

  const ingestFiles = useCallback(
    async (files: File[]) => {
      if (!files.length || !beginDrop()) return;
      try {
        const result = await stageBrowserFiles(files);
        if (
          !result.images.length &&
          !result.files.length &&
          !result.texts.length
        ) {
          window.alert(t("alert.dropReadFailed"));
          return;
        }
        applyStage(result);
      } catch (err) {
        console.error(err);
        window.alert(
          err instanceof Error ? err.message : t("alert.addFileFailed"),
        );
      } finally {
        busyRef.current = false;
      }
    },
    [applyStage],
  );

  useTauriFileDrop({
    enabled: Boolean(node),
    onHover: (active) => {
      if (nodeRef.current) setDragging(active);
    },
    onDropPaths: (paths) => {
      void ingestPaths(paths);
    },
  });

  const pickImages = useCallback(async () => {
    try {
      const result = await pickAndStage({ imagesOnly: true });
      applyStage(result);
    } catch (err) {
      console.error(err);
      window.alert(
        err instanceof Error ? err.message : t("alert.insertImageFailed"),
      );
    }
  }, [applyStage]);

  const pickFiles = useCallback(async () => {
    try {
      const result = await pickAndStage({ filesOnly: true });
      applyStage(result);
    } catch (err) {
      console.error(err);
      window.alert(
        err instanceof Error ? err.message : t("alert.addFileFailed"),
      );
    }
  }, [applyStage]);

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current -= 1;
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    const list = [...e.dataTransfer.files];
    if (!list.length) return;
    await ingestFiles(list);
  };

  const scopeHintFor = (capture: WandCapture): string => {
    if (capture.kind === "node") return tr("wand.scopeNode");
    if (capture.block === "code") return tr("wand.scopeCode");
    if (capture.block === "callout") return tr("wand.scopeCallout");
    return tr("wand.scopeSelection");
  };

  const openStats = useCallback(() => {
    if (!node || contentStreaming) return;
    const cap = editorRef.current?.captureWandTarget();
    if (cap && cap.kind === "selection" && cap.text.trim()) {
      setSelectionSnap({ text: cap.text, block: cap.block });
      setStatsScope("selection");
    } else {
      setSelectionSnap(null);
      setStatsScope((s) => (s === "selection" ? "nodeOnly" : s));
    }
    setStatsOpen(true);
  }, [node, contentStreaming]);

  const toggleStats = useCallback(() => {
    if (statsOpen) {
      setStatsOpen(false);
      return;
    }
    openStats();
  }, [statsOpen, openStats]);

  useEffect(() => {
    const onHotkey = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id === "statsToggle") toggleStats();
    };
    window.addEventListener("wg:hotkey", onHotkey);
    return () => window.removeEventListener("wg:hotkey", onHotkey);
  }, [toggleStats]);

  const selectionStats = useMemo(() => {
    if (!selectionSnap) return null;
    return analyzeSelection(selectionSnap.text, selectionSnap.block);
  }, [selectionSnap]);

  const stats = useMemo(
    () =>
      analyzeScope({
        scope: statsScope,
        tree: numberedTree,
        current: node,
        selectionStats,
      }),
    [statsScope, numberedTree, node, selectionStats],
  );

  const openWand = async () => {
    if (!node || contentStreaming || wandBusy) return;
    await ensureApiSettings();
    if (!isApiConfigured()) {
      window.alert(tr("inspire.apiMissing"));
      return;
    }
    const capture =
      editorRef.current?.captureWandTarget() ?? {
        kind: "node" as const,
        current: node.content,
      };
    setWandPhase({
      step: "idea",
      capture,
      scopeHint: scopeHintFor(capture),
    });
  };

  const runWand = async (phase: Extract<WandPhase, { step: "confirm" }>) => {
    if (!node) return;
    setWandBusy(true);
    try {
      const out = await wandRewrite({
        idea: phase.idea,
        title: node.title,
        numberLabel,
        treeOutline: formatTreeTitleOutline(numberedTree, node.id),
        scope: phase.capture.kind === "node" ? "node" : "selection",
        current:
          phase.capture.kind === "node"
            ? phase.capture.current
            : phase.capture.text,
        nodeBody: node.content,
        block:
          phase.capture.kind === "selection" ? phase.capture.block : undefined,
        language:
          phase.capture.kind === "selection"
            ? phase.capture.language
            : undefined,
      });
      editorRef.current?.applyWandResult(phase.capture, out);
      setWandPhase(null);
    } catch (err) {
      console.error(err);
      const msg =
        err instanceof Error && err.message === "API_NOT_CONFIGURED"
          ? tr("inspire.apiMissing")
          : err instanceof Error
            ? err.message
            : tr("inspire.failed");
      window.alert(msg);
    } finally {
      setWandBusy(false);
    }
  };

  const openTabs =
    projectTab &&
    onOpenWorkspacePage &&
    onCloseOpenedPage &&
    onCloseOtherOpenedPages &&
    onCloseAllOpenedPages ? (
      <WorkspaceOpenTabs
        tab={projectTab}
        active={openedActive}
        onSelect={onOpenWorkspacePage}
        onClose={onCloseOpenedPage}
        onCloseOthers={onCloseOtherOpenedPages}
        onCloseAll={onCloseAllOpenedPages}
      />
    ) : null;

  if (!node) {
    return (
      <div className={styles.empty} data-enter>
        {openTabs}
        <div className={styles.emptyHint}>{tr("editor.pickNode")}</div>
      </div>
    );
  }

  const titleText = node.title.trim() || tr("editor.nodeUntitled");

  return (
    <div
      className={styles.root}
      data-wg-focus="editor"
      data-drop={dragging || undefined}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {dragging && (
        <div className={styles.dropMask}>{tr("editor.dropHint")}</div>
      )}
      {openTabs}
      <div className={styles.titleBlock}>
        {numberLabel && (
          <span className={styles.number} aria-hidden>
            {numberLabel}
          </span>
        )}
        {editingTitle ? (
          <input
            ref={titleInputRef}
            className={styles.titleInput}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => commitTitle()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitTitle();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditingTitle(false);
              }
            }}
            aria-label={tr("editor.nodeTitle")}
            placeholder={tr("editor.nodeUntitled")}
            size={Math.max(4, (titleDraft || tr("editor.nodeUntitled")).length)}
          />
        ) : (
          <button
            type="button"
            className={styles.titleText}
            onClick={() => {
              setTitleDraft(node.title);
              setEditingTitle(true);
            }}
            aria-label={tr("editor.nodeTitle")}
          >
            {titleText}
          </button>
        )}
        <button
          type="button"
          className={styles.statsBtn}
          onClick={toggleStats}
          disabled={contentStreaming}
          title={tr("stats.buttonHint")}
          aria-label={tr("stats.button")}
          aria-expanded={statsOpen}
        >
          {tr("stats.button")}
        </button>
        <button
          type="button"
          className={styles.wandBtn}
          onClick={() => void openWand()}
          disabled={contentStreaming || wandBusy}
          title={tr("wand.button")}
          aria-label={tr("wand.button")}
        >
          <WandIcon />
        </button>
      </div>
      {statsOpen ? (
        <ContentStatsPanel
          scope={statsScope}
          onScopeChange={(s) => {
            if (s === "selection" && !selectionSnap) {
              const cap = editorRef.current?.captureWandTarget();
              if (cap && cap.kind === "selection" && cap.text.trim()) {
                setSelectionSnap({ text: cap.text, block: cap.block });
                setStatsScope("selection");
              }
              return;
            }
            setStatsScope(s);
          }}
          stats={stats}
          selectionAvailable={Boolean(selectionSnap?.text.trim())}
          onClose={() => setStatsOpen(false)}
        />
      ) : null}
      <div className={styles.editorArea}>
        <EditorView
          ref={editorRef}
          nodeId={node.id}
          markdown={diffPreviewMarkdown ?? node.content}
          onChange={onContentChange}
          contentStreaming={contentStreaming}
          contentLocked={Boolean(diffPreviewMarkdown)}
          glossaryLinks={glossaryLinks}
          glossaryColors={glossaryColors}
          glossaryTitles={glossaryTitles}
          glossaryBodies={glossaryBodies}
          onGlossaryEntryClick={onGlossaryEntryClick}
          onGlossaryPeek={onGlossaryPeek}
          onGlossaryOpen={onGlossaryOpen}
          onBindGlossary={onBindGlossary}
          onCreateGlossaryChild={onCreateGlossaryChild}
          onUnbindGlossary={onUnbindGlossary}
          onUnbindGlossaryLink={onUnbindGlossaryLink}
          onPickImage={pickImages}
          onDropFiles={(files) => {
            void ingestFiles(files);
            return true;
          }}
        />
        <AttachmentBar
          attachments={node.attachments}
          onAdd={pickFiles}
          onOpen={onOpenAttachment}
          onRemove={onRemoveAttachment}
        />
      </div>

      {wandPhase?.step === "idea" ? (
        <WandIdeaDialog
          scopeHint={wandPhase.scopeHint}
          onCancel={() => setWandPhase(null)}
          onSubmit={(idea) =>
            setWandPhase({
              step: "confirm",
              capture: wandPhase.capture,
              scopeHint: wandPhase.scopeHint,
              idea,
            })
          }
        />
      ) : null}
      {wandPhase?.step === "confirm" ? (
        <WandConfirmDialog
          scopeHint={wandPhase.scopeHint}
          busy={wandBusy}
          onCancel={() => {
            if (wandBusy) return;
            setWandPhase(null);
          }}
          onConfirm={() => void runWand(wandPhase)}
        />
      ) : null}
    </div>
  );
}

function WandIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20 14.5 9.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="m13.2 8.2 2.6 2.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M15.8 4.2 16.6 6l1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8zM19.2 10.2l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5zM10.5 3.5l.4.9.9.4-.9.4-.4.9-.4-.9-.9-.4.9-.4z"
        fill="currentColor"
      />
    </svg>
  );
}
