/**
 * 从粘贴新建大纲：本地按结构拆分（序号+标题）或 AI 整理；确认后新开项目。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ensureApiSettings, isApiConfigured } from "@/ai/openaiCompat";
import {
  createId,
  splitPasteByStructure,
  type StructureSplitResult,
  type TreeNode,
} from "@/domain";
import { useI18n } from "@/i18n/useI18n";
import styles from "./PasteImportDialog.module.css";

const PREVIEW_ROOT_ID = "__paste_preview_root__";

function buildPreviewRoot(children: TreeNode[], title: string): TreeNode {
  return {
    id: PREVIEW_ROOT_ID,
    title,
    content: "",
    attachments: [],
    children,
  };
}

function firstFocusId(root: TreeNode): string {
  const walk = (n: TreeNode): string | null => {
    if (n.id !== PREVIEW_ROOT_ID && n.content.trim()) return n.id;
    for (const c of n.children) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return n.id !== PREVIEW_ROOT_ID ? n.id : null;
  };
  return walk(root) ?? root.children[0]?.id ?? root.id;
}

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const c = findNode(n.children, id);
    if (c) return c;
  }
  return null;
}

export type PasteImportMode = "structure" | "ai";

export type PasteImportCommit =
  | { mode: "structure"; root: TreeNode }
  | { mode: "ai"; text: string; rootTitle: string };

interface PasteImportDialogProps {
  onCommit: (payload: PasteImportCommit) => void;
  onCancel: () => void;
  onOpenSettings: () => void;
}

function PreviewTree({
  nodes,
  activeId,
  onSelect,
}: {
  nodes: TreeNode[];
  activeId: string | null;
  onSelect: (n: TreeNode) => void;
}) {
  return (
    <ul className={styles.treeList}>
      {nodes.map((n) => (
        <li key={n.id}>
          <span
            className={`${styles.treeItem} ${
              activeId === n.id ? styles.treeItemActive : ""
            }`}
            onClick={() => onSelect(n)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelect(n);
            }}
            role="button"
            tabIndex={0}
          >
            {n.title}
          </span>
          {n.children.length > 0 && (
            <PreviewTree
              nodes={n.children}
              activeId={activeId}
              onSelect={onSelect}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

export function PasteImportDialog({
  onCommit,
  onCancel,
  onOpenSettings,
}: PasteImportDialogProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<PasteImportMode>("structure");
  const [text, setText] = useState("");
  const [html, setHtml] = useState<string | null>(null);
  const [rootTitle, setRootTitle] = useState(t("pasteImport.rootDefault"));
  const [split, setSplit] = useState<StructureSplitResult | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState<boolean | null>(null);
  const guideTitle = t("pasteImport.guideTitle");
  const defaultRootTitle = t("pasteImport.rootDefault");

  const refreshApi = useCallback(async () => {
    const s = await ensureApiSettings();
    setApiReady(isApiConfigured(s));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const clip = await navigator.clipboard.readText();
        if (!cancelled && clip.trim()) setText(clip);
      } catch {
        /* 无权限则靠手动粘贴 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refreshApi();
  }, [refreshApi]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshApi();
    };
    const onFocus = () => void refreshApi();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshApi]);

  const previewRoot = useMemo(() => {
    if (mode !== "structure" || !split || !split.children.length) return null;
    return buildPreviewRoot(
      split.children,
      rootTitle.trim() || defaultRootTitle,
    );
  }, [mode, split, rootTitle, defaultRootTitle]);

  const activeNode = useMemo(() => {
    if (!previewRoot || !activeId) return null;
    return findNode([previewRoot], activeId);
  }, [previewRoot, activeId]);

  const onPreview = useCallback(() => {
    const result = splitPasteByStructure(
      { text, html },
      { guideTitle },
    );
    setSplit(result);
    if (result.children.length) {
      const root = buildPreviewRoot(
        result.children,
        rootTitle.trim() || defaultRootTitle,
      );
      setActiveId(firstFocusId(root));
    } else {
      setActiveId(null);
    }
  }, [text, html, guideTitle, rootTitle, defaultRootTitle]);

  const canImport =
    Boolean(previewRoot) && Boolean(split) && split!.hitCount > 0;

  const commitAi = () => {
    if (apiReady !== true) {
      onOpenSettings();
      window.setTimeout(() => void refreshApi(), 400);
      return;
    }
    onCommit({
      mode: "ai",
      text: text.trim(),
      rootTitle: rootTitle.trim() || defaultRootTitle,
    });
  };

  return createPortal(
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wg-paste-import-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <div>
            <h2 id="wg-paste-import-title" className={styles.title}>
              {t("pasteImport.title")}
            </h2>
            <p className={styles.sub}>{t("pasteImport.subtitle")}</p>
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label={t("pasteImport.cancel")}
            onClick={onCancel}
          >
            ×
          </button>
        </div>

        <div className={styles.modes} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "structure"}
            className={`${styles.modeBtn} ${
              mode === "structure" ? styles.modeBtnActive : ""
            }`}
            onClick={() => setMode("structure")}
          >
            {t("pasteImport.modeStructure")}
            <span className={styles.modeHint}>
              {t("pasteImport.modeStructureHint")}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "ai"}
            className={`${styles.modeBtn} ${
              mode === "ai" ? styles.modeBtnActive : ""
            }`}
            onClick={() => setMode("ai")}
          >
            {t("pasteImport.modeAi")}
            <span className={styles.modeHint}>
              {t("pasteImport.modeAiHint")}
            </span>
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.fieldLabelRow}>
            <p className={styles.fieldLabel}>{t("pasteImport.pasteLabel")}</p>
            {mode === "ai" && apiReady === false && (
              <p className={styles.apiInline}>
                {t("pasteImport.apiMissingInline")}
                <button
                  type="button"
                  className={styles.apiLink}
                  onClick={() => {
                    onOpenSettings();
                    window.setTimeout(() => void refreshApi(), 400);
                  }}
                >
                  {t("pasteImport.openSettings")}
                </button>
              </p>
            )}
          </div>
          <textarea
            className={styles.input}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setHtml(null);
              setSplit(null);
              setActiveId(null);
            }}
            onPaste={(e) => {
              const h = e.clipboardData.getData("text/html");
              const p = e.clipboardData.getData("text/plain");
              if (h.trim()) setHtml(h);
              else setHtml(null);
              if (p) {
                e.preventDefault();
                setText(p);
                setSplit(null);
                setActiveId(null);
              }
            }}
            placeholder={t("pasteImport.pastePlaceholder")}
            rows={8}
            autoFocus
          />

          <p className={styles.fieldLabel}>{t("pasteImport.rootLabel")}</p>
          <input
            className={styles.rootTitle}
            value={rootTitle}
            onChange={(e) => setRootTitle(e.target.value)}
          />

          {mode === "structure" && (
            <>
              <p className={styles.sub}>{t("pasteImport.structureTip")}</p>
              {split?.weak && (
                <p className={styles.warn}>{t("pasteImport.weakWarn")}</p>
              )}
              {previewRoot && (
                <div className={styles.previewRow}>
                  <div className={styles.previewPane}>
                    <h3>{t("pasteImport.previewTree")}</h3>
                    <PreviewTree
                      nodes={[previewRoot]}
                      activeId={activeId}
                      onSelect={(n) => setActiveId(n.id)}
                    />
                  </div>
                  <div className={styles.previewPane}>
                    <h3>{t("pasteImport.previewBody")}</h3>
                    <p className={styles.bodyPreview}>
                      {activeNode
                        ? activeNode.content.trim() ||
                          t("pasteImport.emptyBody")
                        : t("pasteImport.pickNode")}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {mode === "ai" && (
            <p className={styles.sub}>{t("pasteImport.aiTip")}</p>
          )}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onCancel}>
            {t("pasteImport.cancel")}
          </button>
          {mode === "structure" ? (
            <>
              <button
                type="button"
                className={styles.ghost}
                disabled={!text.trim()}
                onClick={onPreview}
              >
                {t("pasteImport.preview")}
              </button>
              <button
                type="button"
                className={styles.primary}
                disabled={!canImport}
                onClick={() => {
                  if (!previewRoot || !split) return;
                  onCommit({
                    mode: "structure",
                    root: {
                      ...previewRoot,
                      id: createId(),
                      children: split.children,
                    },
                  });
                }}
              >
                {t("pasteImport.import")}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.primary}
              disabled={!text.trim()}
              onClick={commitAi}
            >
              {apiReady === false
                ? t("pasteImport.openSettings")
                : t("pasteImport.generateNew")}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
