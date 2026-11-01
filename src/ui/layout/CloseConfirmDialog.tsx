/**
 * 关闭脏项目时的三选一提示。
 */

import { useI18n } from "@/i18n/useI18n";
import styles from "./CloseConfirmDialog.module.css";

interface CloseConfirmDialogProps {
  title: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function CloseConfirmDialog({
  title,
  onSave,
  onDiscard,
  onCancel,
}: CloseConfirmDialogProps) {
  const { t } = useI18n();

  return (
    <div className={styles.backdrop} role="presentation" onClick={onCancel}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wg-close-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wg-close-title" className={styles.title}>
          {t("close.title", { name: title })}
        </h2>
        <p className={styles.body}>{t("close.body")}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onCancel}>
            {t("close.cancel")}
          </button>
          <button type="button" className={styles.danger} onClick={onDiscard}>
            {t("close.discard")}
          </button>
          <button type="button" className={styles.primary} onClick={onSave}>
            {t("close.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
