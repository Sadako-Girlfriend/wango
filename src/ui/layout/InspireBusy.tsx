/**
 * 灵感准备期遮罩（首个节点出现前）：提示 + 可选思考流 + 取消。
 */

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import styles from "./InspireBusy.module.css";

export function InspireBusy({
  phase = "prepare",
  thinking = "",
  onCancel,
}: {
  phase?: "prepare" | "live";
  /** 深度思考流式文本；无则只显示准备提示 */
  thinking?: string;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const bodyRef = useRef<HTMLPreElement>(null);
  const [thinkingOpen, setThinkingOpen] = useState(true);
  const hasThinking = Boolean(thinking.trim());

  useEffect(() => {
    if (!hasThinking) return;
    setThinkingOpen(true);
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thinking, hasThinking]);

  if (phase === "live") return null;

  return (
    <div className={styles.prepare} role="status" aria-live="polite">
      <div className={styles.preparePanel}>
        <p className={styles.prepareTitle}>{t("inspire.preparing")}</p>
        <p className={styles.prepareHint}>{t("inspire.preparingHint")}</p>

        {hasThinking ? (
          <details
            className={styles.thinking}
            open={thinkingOpen}
            onToggle={(e) =>
              setThinkingOpen((e.target as HTMLDetailsElement).open)
            }
          >
            <summary className={styles.thinkingSummary}>
              <span className={styles.thinkingCaret} aria-hidden>
                ▸
              </span>
              {t("inspire.thinkingLive")}
            </summary>
            <pre className={styles.thinkingBody} ref={bodyRef}>
              {thinking}
            </pre>
          </details>
        ) : null}

        {onCancel ? (
          <button
            type="button"
            className={styles.cancel}
            onClick={onCancel}
          >
            {t("inspire.cancel")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
