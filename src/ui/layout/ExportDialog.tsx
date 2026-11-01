/**
 * 导出格式选择弹窗：左栏选格式（2×2 + 底栏 .wango），右栏出当前格式设置。
 */

import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/useI18n";
import { ExportSamplePreview } from "./ExportSamplePreview";
import styles from "./ExportDialog.module.css";

export type ExportKind = "ai" | "mindmap" | "wango-as" | "pdf" | "images";
export type ExportScope = "project" | "node";
export type ExportNumbering = "restart" | "preserve";
/** 内容图片：单张长图 / 多张按节点 / 多张按大节点 */
export type ExportImageMode = "long" | "batch-node" | "batch-major";

export type ExportRequest = {
  kind: ExportKind;
  scope?: ExportScope;
  numbering?: ExportNumbering;
  imageMode?: ExportImageMode;
};

interface ExportDialogProps {
  hasSelection: boolean;
  onExport: (req: ExportRequest) => void | Promise<void>;
  onCancel: () => void;
}

/** 左栏上方 2×2：内容产物 */
const TILE_KINDS: ExportKind[] = ["ai", "pdf", "mindmap", "images"];

function IconMarkdown() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm1 3v10h2.5l2-3.2L12 17h2.5V7H12v5.6L9.5 9H7.2L4.8 12.6V7H5zm11.2 0-.1 6.2 1.9-1.9L20 13.5 16.1 17H15V7h1.2z"
      />
    </svg>
  );
}

function IconPdf() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm1 7V3.5L19.5 9H15zM8.2 18H7v-5h1.6c1.2 0 2 .6 2 1.6 0 .6-.3 1.1-.8 1.3l1.1 2.1h-1.3l-.9-1.8H8.2V18zm0-2.7h.4c.4 0 .7-.2.7-.6s-.3-.6-.7-.6h-.4v1.2zM13 18h-1.2v-5H14c1.1 0 1.8.7 1.8 1.7S15.1 16.4 14 16.4h-.8V18zm0-2.7h.7c.4 0 .7-.2.7-.6s-.3-.6-.7-.6h-.7v1.2zm5.2 2.7h-2.4v-5H18v1h-1.2v1h1.1v1h-1.1V18z"
      />
    </svg>
  );
}

function IconMindmap() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M9 4a3 3 0 0 1 2.8 4H14a3 3 0 1 1 0 2h-2.2A3 3 0 0 1 6.2 12H5a3 3 0 1 1 0-2h1.2A3 3 0 0 1 9 4zm0 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM5 12a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm12-2a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-2.2 6H12a3 3 0 1 1 0-2h2.8A3.01 3.01 0 0 1 20 14a3 3 0 0 1-5.2 2zM12 15a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm7-1a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"
      />
    </svg>
  );
}

function IconImages() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M19 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 12H5V7h14v10zm-3.2-7.4a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4zM6.5 15l3.2-4.1 2.3 2.8 1.7-2.1L17.5 15h-11z"
      />
    </svg>
  );
}

function IconWango() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M10 4H4v6h6V4zm10 0h-6v6h6V4zM10 14H4v6h6v-6zm10 0h-6v6h6v-6zM8 6v2H6V6h2zm10 0v2h-2V6h2zM8 16v2H6v-2h2zm10 0v2h-2v-2h2z"
      />
    </svg>
  );
}

function iconOf(kind: ExportKind): ReactNode {
  if (kind === "ai") return <IconMarkdown />;
  if (kind === "pdf") return <IconPdf />;
  if (kind === "mindmap") return <IconMindmap />;
  if (kind === "images") return <IconImages />;
  return <IconWango />;
}

export function ExportDialog({
  hasSelection,
  onExport,
  onCancel,
}: ExportDialogProps) {
  const { t } = useI18n();
  const [kind, setKind] = useState<ExportKind>("ai");
  const [scope, setScope] = useState<ExportScope>("project");
  const [numbering, setNumbering] = useState<ExportNumbering>("restart");
  const [imageTier, setImageTier] = useState<"single" | "multi">("single");
  const [imageBatch, setImageBatch] = useState<"node" | "major">("node");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  useEffect(() => {
    if (kind === "pdf" && scope === "node" && !hasSelection) {
      setScope("project");
    }
  }, [kind, scope, hasSelection]);

  const shortOf = (k: ExportKind) => {
    if (k === "ai") return t("export.tileAi");
    if (k === "mindmap") return t("export.tileMindmap");
    if (k === "pdf") return t("export.tilePdf");
    if (k === "images") return t("export.tileImages");
    return t("export.tileWango");
  };

  const useOf = (k: ExportKind) => {
    if (k === "ai") return t("export.tileAiUse");
    if (k === "mindmap") return t("export.tileMindmapUse");
    if (k === "pdf") return t("export.tilePdfUse");
    if (k === "images") return t("export.tileImagesUse");
    return t("export.tileWangoUse");
  };

  const panelTitleOf = (k: ExportKind) => {
    if (k === "ai") return t("export.panelAi");
    if (k === "mindmap") return t("export.panelMindmap");
    if (k === "pdf") return t("export.panelPdf");
    if (k === "images") return t("export.panelImages");
    return t("export.panelWango");
  };

  const hintOf = (k: ExportKind) => {
    if (k === "ai") return t("export.dialogAiHint");
    if (k === "mindmap") return t("export.dialogMindmapHint");
    if (k === "pdf") return t("export.dialogPdfHint");
    if (k === "images") return t("export.dialogImagesHint");
    return t("export.dialogWangoHint");
  };

  const resolveImageMode = (): ExportImageMode => {
    if (imageTier === "single") return "long";
    return imageBatch === "node" ? "batch-node" : "batch-major";
  };

  const confirm = async () => {
    if (busy) return;
    if (kind === "pdf" && scope === "node" && !hasSelection) return;
    setBusy(true);
    try {
      if (kind === "pdf") {
        await onExport({
          kind,
          scope,
          numbering: scope === "node" ? numbering : undefined,
        });
      } else if (kind === "images") {
        await onExport({ kind, imageMode: resolveImageMode() });
      } else {
        await onExport({ kind });
      }
      onCancel();
    } catch {
      /* App 内已 alert */
    } finally {
      setBusy(false);
    }
  };

  const formatTile = (k: ExportKind, wide = false) => {
    const selected = kind === k;
    return (
      <button
        key={k}
        type="button"
        role="radio"
        aria-checked={selected}
        className={[
          wide ? styles.wideTile : styles.tile,
          selected ? styles.tileActive : "",
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={busy}
        onClick={() => setKind(k)}
      >
        <span className={styles.tileIcon}>{iconOf(k)}</span>
        <span className={styles.tileText}>
          <span className={styles.tileLabel}>{shortOf(k)}</span>
          <span className={styles.tileUse}>{useOf(k)}</span>
        </span>
      </button>
    );
  };

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wg-export-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wg-export-title" className={styles.title}>
          {t("export.dialogTitle")}
        </h2>
        <p className={styles.hint}>{t("export.dialogBody")}</p>

        <div className={styles.layout}>
          <div
            className={styles.formatCol}
            role="radiogroup"
            aria-label={t("export.formatPick")}
          >
            <div className={styles.formatLabel}>{t("export.formatPick")}</div>
            <div className={styles.tileGrid}>
              {TILE_KINDS.map((k) => formatTile(k))}
            </div>
            {formatTile("wango-as", true)}
          </div>

          <div className={styles.settingsCol}>
            <div className={styles.panelTitle}>{panelTitleOf(kind)}</div>
            <p className={styles.panelDesc}>{hintOf(kind)}</p>

            <ExportSamplePreview
              kind={kind}
              imageMulti={kind === "images" && imageTier === "multi"}
            />

            <div
              className={
                kind === "pdf" || kind === "images"
                  ? `${styles.optionsSlot} ${styles.optionsSlotActive}`
                  : styles.optionsSlot
              }
            >
              {kind === "pdf" && (
                <div className={styles.scopeBlock}>
                  <div className={styles.scopeLabel}>
                    {t("export.dialogScope")}
                  </div>
                  <div
                    className={styles.scopeRow}
                    role="radiogroup"
                    aria-label={t("export.dialogScope")}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={scope === "project"}
                      className={
                        scope === "project"
                          ? styles.scopeActive
                          : styles.scopeBtn
                      }
                      disabled={busy}
                      onClick={() => setScope("project")}
                    >
                      {t("export.dialogScopeProject")}
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={scope === "node"}
                      className={
                        scope === "node" ? styles.scopeActive : styles.scopeBtn
                      }
                      disabled={busy || !hasSelection}
                      title={
                        hasSelection
                          ? undefined
                          : t("export.dialogScopeNodeDisabled")
                      }
                      onClick={() => setScope("node")}
                    >
                      {t("export.dialogScopeNode")}
                    </button>
                  </div>

                  {scope === "node" && (
                    <div className={styles.scopeSub}>
                      <div className={styles.scopeLabel}>
                        {t("export.dialogNumbering")}
                      </div>
                      <div
                        className={styles.scopeRow}
                        role="radiogroup"
                        aria-label={t("export.dialogNumbering")}
                      >
                        <button
                          type="button"
                          role="radio"
                          aria-checked={numbering === "restart"}
                          className={
                            numbering === "restart"
                              ? styles.scopeActive
                              : styles.scopeBtn
                          }
                          disabled={busy}
                          onClick={() => setNumbering("restart")}
                        >
                          {t("export.dialogNumberingRestart")}
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={numbering === "preserve"}
                          className={
                            numbering === "preserve"
                              ? styles.scopeActive
                              : styles.scopeBtn
                          }
                          disabled={busy}
                          onClick={() => setNumbering("preserve")}
                        >
                          {t("export.dialogNumberingPreserve")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {kind === "images" && (
                <div className={styles.scopeBlock}>
                  <div className={styles.scopeLabel}>
                    {t("export.dialogImageTier")}
                  </div>
                  <div
                    className={styles.scopeRow}
                    role="radiogroup"
                    aria-label={t("export.dialogImageTier")}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={imageTier === "single"}
                      className={
                        imageTier === "single"
                          ? styles.scopeActive
                          : styles.scopeBtn
                      }
                      disabled={busy}
                      onClick={() => setImageTier("single")}
                    >
                      {t("export.dialogImageSingle")}
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={imageTier === "multi"}
                      className={
                        imageTier === "multi"
                          ? styles.scopeActive
                          : styles.scopeBtn
                      }
                      disabled={busy}
                      onClick={() => setImageTier("multi")}
                    >
                      {t("export.dialogImageMulti")}
                    </button>
                  </div>

                  {imageTier === "multi" && (
                    <div className={styles.scopeSub}>
                      <div className={styles.scopeLabel}>
                        {t("export.dialogImageBatch")}
                      </div>
                      <div
                        className={styles.scopeRow}
                        role="radiogroup"
                        aria-label={t("export.dialogImageBatch")}
                      >
                        <button
                          type="button"
                          role="radio"
                          aria-checked={imageBatch === "node"}
                          className={
                            imageBatch === "node"
                              ? styles.scopeActive
                              : styles.scopeBtn
                          }
                          disabled={busy}
                          title={t("export.dialogImageBatchNodeHint")}
                          onClick={() => setImageBatch("node")}
                        >
                          {t("export.dialogImageBatchNode")}
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={imageBatch === "major"}
                          className={
                            imageBatch === "major"
                              ? styles.scopeActive
                              : styles.scopeBtn
                          }
                          disabled={busy}
                          title={t("export.dialogImageBatchMajorHint")}
                          onClick={() => setImageBatch("major")}
                        >
                          {t("export.dialogImageBatchMajor")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.ghost}
            disabled={busy}
            onClick={onCancel}
          >
            {t("export.dialogCancel")}
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? t("export.dialogWorking") : t("export.dialogConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
