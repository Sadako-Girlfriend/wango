/**
 * 灵感准备期遮罩（首个节点出现前）。
 * 生成中/取消改由顶部「灵感」按钮承担。
 */

import { useI18n } from "@/i18n/useI18n";
import styles from "./InspireBusy.module.css";

export function InspireBusy({
  phase = "prepare",
}: {
  phase?: "prepare" | "live";
}) {
  const { t } = useI18n();
  if (phase === "live") return null;

  return (
    <div className={styles.prepare} role="status" aria-live="polite">
      <div className={styles.preparePanel}>
        <p className={styles.prepareTitle}>{t("inspire.preparing")}</p>
        <p className={styles.prepareHint}>{t("inspire.preparingHint")}</p>
      </div>
    </div>
  );
}
