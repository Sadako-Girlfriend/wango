/**
 * 灵感：一句话 / 框架主题输入。
 */

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import styles from "./InspirePromptDialog.module.css";

interface InspirePromptDialogProps {
  mode: "sentence" | "outline";
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function InspirePromptDialog({
  mode,
  onSubmit,
  onCancel,
}: InspirePromptDialogProps) {
  const { t } = useI18n();
  const [text, setText] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const title =
    mode === "sentence"
      ? t("inspire.sentenceTitle")
      : t("inspire.outlineTitle");
  const hint =
    mode === "sentence"
      ? t("inspire.sentenceBody")
      : t("inspire.outlineBody");
  const placeholder =
    mode === "sentence"
      ? t("inspire.sentencePlaceholder")
      : t("inspire.outlinePlaceholder");

  return (
    <div className={styles.backdrop} role="presentation" onClick={onCancel}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wg-inspire-prompt-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wg-inspire-prompt-title" className={styles.title}>
          {title}
        </h2>
        <p className={styles.hint}>{hint}</p>
        <textarea
          className={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          rows={3}
          autoFocus
        />
        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onCancel}>
            {t("inspire.cancel")}
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={!text.trim()}
            onClick={() => onSubmit(text.trim())}
          >
            {t("inspire.generate")}
          </button>
        </div>
      </div>
    </div>
  );
}
