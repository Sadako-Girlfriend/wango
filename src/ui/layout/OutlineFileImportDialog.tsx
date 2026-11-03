/**
 * 从文件导入大纲：.docx（标题样式）/ .md（# 标题）→ 预览 → 挂导入根。
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  createId,
  splitDocxOutline,
  splitMarkdownOutline,
  type StructureSplitResult,
  type TreeNode,
} from "@/domain";
import { useI18n } from "@/i18n/useI18n";
import styles from "./PasteImportDialog.module.css";

const PREVIEW_ROOT_ID = "__file_preview_root__";

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
  // 导入根只是容器、无正文：默认落到第一个真实子节点
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

interface OutlineFileImportDialogProps {
  fileName: string;
  kind: "markdown" | "docx";
  text?: string;
  bytes?: ArrayBuffer;
  onCommit: (root: TreeNode) => void;
  onCancel: () => void;
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
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(n);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(n);
              }
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

export function OutlineFileImportDialog({
  fileName,
  kind,
  text,
  bytes,
  onCommit,
  onCancel,
}: OutlineFileImportDialogProps) {
  const { t } = useI18n();
  const [rootTitle, setRootTitle] = useState(
    fileName.replace(/\.(docx|md|markdown)$/i, "") || t("pasteImport.rootDefault"),
  );
  const [split, setSplit] = useState<StructureSplitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

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

  const guideTitle = t("pasteImport.guideTitle");
  const rootDefault = t("pasteImport.rootDefault");
  const parseFailedMsg = t("fileImport.parseFailed");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        let result: StructureSplitResult;
        if (kind === "markdown") {
          result = splitMarkdownOutline(text ?? "", {
            guideTitle,
          });
        } else {
          if (!bytes) throw new Error("missing docx bytes");
          result = await splitDocxOutline(bytes, { guideTitle });
        }
        if (!cancelled) {
          setSplit(result);
          if (result.children.length) {
            const root = buildPreviewRoot(
              result.children,
              fileName.replace(/\.(docx|md|markdown)$/i, "") || rootDefault,
            );
            setActiveId(firstFocusId(root));
          } else {
            setActiveId(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : parseFailedMsg,
          );
          setSplit(null);
          setActiveId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // 勿依赖整个 t：i18n 函数常变会反复重置 activeId，点预览像失灵
  }, [kind, text, bytes, fileName, guideTitle, rootDefault, parseFailedMsg]);

  const previewRoot = useMemo(() => {
    if (!split?.children.length) return null;
    return buildPreviewRoot(
      split.children,
      rootTitle.trim() || t("pasteImport.rootDefault"),
    );
  }, [split, rootTitle, t]);

  const activeNode = useMemo(() => {
    if (!previewRoot || !activeId) return null;
    return findNode([previewRoot], activeId);
  }, [previewRoot, activeId]);

  const canImport = Boolean(previewRoot) && Boolean(split) && split!.hitCount > 0;

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
        aria-labelledby="wg-file-import-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <div>
            <h2 id="wg-file-import-title" className={styles.title}>
              {t("fileImport.title")}
            </h2>
            <p className={styles.sub}>
              {t("fileImport.subtitle", { name: fileName })}
            </p>
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

        <div className={styles.body}>
          <p className={styles.fieldLabel}>{t("pasteImport.rootLabel")}</p>
          <input
            className={styles.rootTitle}
            value={rootTitle}
            onChange={(e) => setRootTitle(e.target.value)}
          />

          <p className={styles.sub}>
            {kind === "docx"
              ? t("fileImport.docxTip")
              : t("fileImport.mdTip")}
          </p>

          {loading && <p className={styles.sub}>{t("fileImport.parsing")}</p>}
          {error && <p className={styles.warn}>{error}</p>}
          {!loading && split?.weak && (
            <p className={styles.warn}>{t("fileImport.weakWarn")}</p>
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
                  {!activeNode
                    ? t("pasteImport.pickNode")
                    : activeNode.id === PREVIEW_ROOT_ID
                      ? t("fileImport.previewRootHint")
                      : activeNode.content.trim() ||
                        t("pasteImport.emptyBody")}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onCancel}>
            {t("pasteImport.cancel")}
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={!canImport || loading}
            onClick={() => {
              if (!previewRoot || !split) return;
              onCommit({
                ...previewRoot,
                id: createId(),
                children: split.children,
              });
            }}
          >
            {t("pasteImport.import")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
