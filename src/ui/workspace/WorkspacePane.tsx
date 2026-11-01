/**
 * 右侧工作区：图片进正文；txt/json/py 等进代码块；其它走附件栏。
 * 桌面端同时接 Tauri 原生拖放 + HTML5 兜底（部分环境原生事件会失效）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorView, type EditorHandle, type WandCapture } from "@/editor";
import type { AttachmentMeta, NumberedTreeNode, TreeNode } from "@/domain";
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
import { AttachmentBar } from "./AttachmentBar";
import { WandConfirmDialog, WandIdeaDialog } from "./WandDialogs";
import styles from "./WorkspacePane.module.css";

interface WorkspacePaneProps {
  node: TreeNode | null;
  numberLabel: string | null;
  /** 编号树：魔法棒上下文用全树标题大纲 */
  numberedTree: NumberedTreeNode[];
  onTitleChange: (title: string) => void;
  onContentChange: (markdown: string) => void;
  /** 灵感生成中：正文只读 + 外推打字机 */
  contentStreaming?: boolean;
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
  onTitleChange,
  onContentChange,
  contentStreaming = false,
  onAttachFiles,
  onOpenAttachment,
  onRemoveAttachment,
}: WorkspacePaneProps) {
  const { t: tr } = useI18n();
  const editorRef = useRef<EditorHandle>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  /** 切换节点时内容区克制入场；灵感打字机期间不叠动画 */
  const [entering, setEntering] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [wandPhase, setWandPhase] = useState<WandPhase>(null);
  const [wandBusy, setWandBusy] = useState(false);
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
    // 首个选中 / 灵感流式：不播切换动画
    if (prev === null || contentStreaming) return;
    setEntering(true);
    const timer = window.setTimeout(() => setEntering(false), 300);
    return () => window.clearTimeout(timer);
  }, [node?.id, contentStreaming]);

  useEffect(() => {
    if (!editingTitle) return;
    const el = titleInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editingTitle]);

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

  if (!node) {
    return (
      <div className={styles.empty} data-enter>
        {tr("editor.pickNode")}
      </div>
    );
  }

  const titleText = node.title.trim() || tr("editor.nodeUntitled");

  return (
    <div
      className={styles.root}
      data-drop={dragging || undefined}
      data-enter={entering || undefined}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {dragging && (
        <div className={styles.dropMask}>{tr("editor.dropHint")}</div>
      )}
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
            value={node.title}
            onChange={(e) => onTitleChange(e.target.value)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                e.preventDefault();
                setEditingTitle(false);
              }
            }}
            aria-label={tr("editor.nodeTitle")}
            placeholder={tr("editor.nodeUntitled")}
            size={Math.max(4, (node.title || tr("editor.nodeUntitled")).length)}
          />
        ) : (
          <button
            type="button"
            className={styles.titleText}
            onClick={() => setEditingTitle(true)}
            aria-label={tr("editor.nodeTitle")}
          >
            {titleText}
          </button>
        )}
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
      <div className={styles.editorArea}>
        <EditorView
          ref={editorRef}
          nodeId={node.id}
          markdown={node.content}
          onChange={onContentChange}
          contentStreaming={contentStreaming}
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
