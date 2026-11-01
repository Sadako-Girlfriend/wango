/**
 * 魔法棒：想法输入 + 覆盖确认。
 */

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import promptStyles from "@/ui/layout/InspirePromptDialog.module.css";
import confirmStyles from "@/ui/layout/CloseConfirmDialog.module.css";

interface WandIdeaDialogProps {
  scopeHint: string;
  onSubmit: (idea: string) => void;
  onCancel: () => void;
}

export function WandIdeaDialog({
  scopeHint,
  onSubmit,
  onCancel,
}: WandIdeaDialogProps) {
  const { t } = useI18n();
  const [text, setText] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className={promptStyles.backdrop} role="presentation" onClick={onCancel}>
      <div
        className={promptStyles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wg-wand-idea-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wg-wand-idea-title" className={promptStyles.title}>
          {t("wand.title")}
        </h2>
        <p className={promptStyles.hint}>
          {t("wand.ideaHint", { scope: scopeHint })}
        </p>
        <textarea
          className={promptStyles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("wand.ideaPlaceholder")}
          rows={4}
          autoFocus
        />
        <div className={promptStyles.actions}>
          <button type="button" className={promptStyles.ghost} onClick={onCancel}>
            {t("wand.cancel")}
          </button>
          <button
            type="button"
            className={promptStyles.primary}
            disabled={!text.trim()}
            onClick={() => onSubmit(text.trim())}
          >
            {t("wand.next")}
          </button>
        </div>
      </div>
    </div>
  );
}

interface WandConfirmDialogProps {
  scopeHint: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function WandConfirmDialog({
  scopeHint,
  busy = false,
  onConfirm,
  onCancel,
}: WandConfirmDialogProps) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  return (
    <div
      className={confirmStyles.backdrop}
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className={confirmStyles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wg-wand-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wg-wand-confirm-title" className={confirmStyles.title}>
          {t("wand.confirmTitle")}
        </h2>
        <p className={confirmStyles.body}>
          {t("wand.confirmBody", { scope: scopeHint })}
        </p>
        <div className={confirmStyles.actions}>
          <button
            type="button"
            className={confirmStyles.ghost}
            disabled={busy}
            onClick={onCancel}
          >
            {t("wand.cancel")}
          </button>
          <button
            type="button"
            className={confirmStyles.danger}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? t("wand.generating") : t("wand.confirmOk")}
          </button>
        </div>
      </div>
    </div>
  );
}
