/**
 * 审查统计弹窗（居中 modal）。
 * Esc 关闭；F10 由外层 WorkspacePane 开关。
 */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ContentStats, StatsScope } from "@/domain";
import { useI18n } from "@/i18n/useI18n";
import styles from "./ContentStatsPanel.module.css";

interface ContentStatsPanelProps {
  scope: StatsScope;
  onScopeChange: (scope: StatsScope) => void;
  stats: ContentStats;
  selectionAvailable: boolean;
  onClose: () => void;
}

export function ContentStatsPanel({
  scope,
  onScopeChange,
  stats,
  selectionAvailable,
  onClose,
}: ContentStatsPanelProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const scopes: Array<{ id: StatsScope; label: string; disabled?: boolean }> = [
    { id: "nodeOnly", label: t("stats.scopeNodeOnly") },
    { id: "nodeWithChildren", label: t("stats.scopeNodeWithChildren") },
    { id: "all", label: t("stats.scopeAll") },
    {
      id: "selection",
      label: t("stats.scopeSelection"),
      disabled: !selectionAvailable,
    },
  ];

  const metrics: Array<{ key: string; label: string; value: number }> = [
    { key: "chars", label: t("stats.chars"), value: stats.chars },
    {
      key: "punctuation",
      label: t("stats.punctuation"),
      value: stats.punctuation,
    },
    { key: "code", label: t("stats.codeBlocks"), value: stats.codeBlocks },
    { key: "callout", label: t("stats.callouts"), value: stats.callouts },
    { key: "math", label: t("stats.mathBlocks"), value: stats.mathBlocks },
  ];

  return createPortal(
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wg-stats-title"
        tabIndex={-1}
      >
        <div className={styles.head}>
          <div className={styles.headText}>
            <h2 id="wg-stats-title" className={styles.title}>
              {t("stats.title")}
            </h2>
            <p className={styles.sub}>{t("stats.subtitle")}</p>
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label={t("stats.close")}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className={styles.scopes} role="tablist">
          {scopes.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              className={styles.scopeBtn}
              aria-selected={scope === s.id}
              disabled={s.disabled}
              data-active={scope === s.id || undefined}
              onClick={() => onScopeChange(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {scope === "selection" && !selectionAvailable ? (
          <p className={styles.hint}>{t("stats.selectionEmpty")}</p>
        ) : (
          <div className={styles.grid}>
            {metrics.map((m) => (
              <div key={m.key} className={styles.card} data-metric={m.key}>
                <div className={styles.cardValue}>{m.value}</div>
                <div className={styles.cardLabel}>{m.label}</div>
              </div>
            ))}
          </div>
        )}

        <p className={styles.footerHint}>{t("stats.shortcutHint")}</p>
      </div>
    </div>,
    document.body,
  );
}
