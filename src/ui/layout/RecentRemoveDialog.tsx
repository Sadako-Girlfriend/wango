/**
 * 最近项目：移出列表 vs 永久删除本机文件。
 */

import { useEffect } from "react";
import type { RecentEntry } from "@/desktop/sessionPersist";
import { useI18n } from "@/i18n/useI18n";
import styles from "./CloseConfirmDialog.module.css";

interface RecentRemoveDialogProps {
  entry: RecentEntry;
  onRemoveFromList: () => void;
  onDeleteForever: () => void;
  onCancel: () => void;
}

export function RecentRemoveDialog({
  entry,
  onRemoveFromList,
  onDeleteForever,
  onCancel,
}: RecentRemoveDialogProps) {
  const { t } = useI18n();
  const canDeleteFile = Boolean(entry.filePath);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className={styles.backdrop} role="presentation" onClick={onCancel}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wg-recent-remove-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wg-recent-remove-title" className={styles.title}>
          {t("recentRemove.title", { name: entry.title })}
        </h2>
        <p className={styles.body}>
          {canDeleteFile
            ? t("recentRemove.bodyFile")
            : t("recentRemove.bodyDraft")}
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onCancel}>
            {t("recentRemove.cancel")}
          </button>
          {canDeleteFile && (
            <button
              type="button"
              className={styles.danger}
              onClick={onDeleteForever}
            >
              {t("recentRemove.deleteForever")}
            </button>
          )}
          <button
            type="button"
            className={styles.primary}
            onClick={onRemoveFromList}
          >
            {t("recentRemove.removeList")}
          </button>
        </div>
      </div>
    </div>
  );
}
