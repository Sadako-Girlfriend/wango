/**
 * 附件条：卡片行（名称 + 类型提示 + 移除），贴近示意图附件区。
 */

import type { AttachmentMeta } from "@/domain";
import { useI18n } from "@/i18n/useI18n";
import styles from "./AttachmentBar.module.css";

interface AttachmentBarProps {
  attachments: AttachmentMeta[];
  onAdd: () => void;
  onOpen: (meta: AttachmentMeta) => void;
  onRemove: (meta: AttachmentMeta) => void;
}

function extLabel(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "FILE";
  return name.slice(i + 1).slice(0, 4).toUpperCase() || "FILE";
}

export function AttachmentBar({
  attachments,
  onAdd,
  onOpen,
  onRemove,
}: AttachmentBarProps) {
  const { t } = useI18n();

  return (
    <div className={styles.bar}>
      {/* 标题 / 添加 / 空态提示同一行，少占正文高度 */}
      <div className={styles.head}>
        <div className={styles.title}>{t("attach.title")}</div>
        <button type="button" className={styles.addBtn} onClick={onAdd}>
          {t("attach.add")}
        </button>
        {attachments.length === 0 ? (
          <span className={styles.empty}>{t("attach.empty")}</span>
        ) : null}
      </div>
      {attachments.length > 0 ? (
        <div className={styles.list}>
          {attachments.map((a) => (
            <div key={a.id} className={styles.item}>
              <div className={styles.icon} aria-hidden>
                {extLabel(a.name)}
              </div>
              <div className={styles.meta}>
                <button
                  type="button"
                  className={styles.nameBtn}
                  title={t("attach.open")}
                  onClick={() => onOpen(a)}
                >
                  {a.name}
                </button>
                <span className={styles.mime}>{a.mime}</span>
              </div>
              <button
                type="button"
                className={styles.removeBtn}
                aria-label={t("attach.remove", { name: a.name })}
                onClick={() => onRemove(a)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
