/**
 * 编辑节点文字标签。
 */

import { useEffect, useState } from "react";
import { normalizeLabels } from "@/domain";
import { useI18n } from "@/i18n/useI18n";
import styles from "@/ui/layout/InspirePromptDialog.module.css";
import local from "./NodeLabelsDialog.module.css";

interface NodeLabelsDialogProps {
  title: string;
  labels: string[];
  onSave: (labels: string[]) => void;
  onCancel: () => void;
}

export function NodeLabelsDialog({
  title,
  labels: initial,
  onSave,
  onCancel,
}: NodeLabelsDialogProps) {
  const { t } = useI18n();
  const [labels, setLabels] = useState(() => normalizeLabels(initial));
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const addDraft = () => {
    const next = normalizeLabels([...labels, draft]);
    setLabels(next);
    setDraft("");
  };

  return (
    <div className={styles.backdrop} role="presentation" onClick={onCancel}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wg-labels-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wg-labels-title" className={styles.title}>
          {t("tree.labelsTitle")}
        </h2>
        <p className={styles.hint}>
          {t("tree.labelsHint", { title: title.trim() || t("editor.nodeUntitled") })}
        </p>
        <div className={local.chips}>
          {labels.length === 0 ? (
            <span className={local.empty}>{t("tree.labelsEmpty")}</span>
          ) : (
            labels.map((lab) => (
              <span key={lab} className={local.chip}>
                {lab}
                <button
                  type="button"
                  className={local.chipRemove}
                  aria-label={t("tree.labelsRemove", { name: lab })}
                  onClick={() =>
                    setLabels((prev) => prev.filter((x) => x !== lab))
                  }
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
        <div className={local.addRow}>
          <input
            className={local.input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDraft();
              }
            }}
            placeholder={t("tree.labelsPlaceholder")}
            maxLength={32}
            autoFocus
          />
          <button
            type="button"
            className={styles.ghost}
            disabled={!draft.trim()}
            onClick={addDraft}
          >
            {t("tree.labelsAdd")}
          </button>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onCancel}>
            {t("tree.labelsCancel")}
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => onSave(normalizeLabels(labels))}
          >
            {t("tree.labelsSave")}
          </button>
        </div>
      </div>
    </div>
  );
}
