/**
 * 词条专属黑名单管理：添加 / 删除语境词组。
 * 黑名单是「另一段语境」（如小小白手），不是词条名本身。
 */

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import styles from "@/ui/layout/InspirePromptDialog.module.css";
import local from "./GlossaryBlacklistDialog.module.css";

interface GlossaryBlacklistDialogProps {
  termTitle: string;
  blacklist: string[];
  onSave: (blacklist: string[]) => void;
  onCancel: () => void;
}

function normalizePhrases(list: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const s = raw.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function GlossaryBlacklistDialog({
  termTitle,
  blacklist: initial,
  onSave,
  onCancel,
}: GlossaryBlacklistDialogProps) {
  const { t } = useI18n();
  const [items, setItems] = useState(() => normalizePhrases(initial));
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const title = termTitle.trim() || t("glossary.untitled");

  const addDraft = () => {
    const phrase = draft.trim();
    if (!phrase) return;
    if (phrase === title) {
      setError(t("glossary.blacklistInvalid", { title }));
      return;
    }
    setError("");
    setItems((prev) => normalizePhrases([...prev, phrase]));
    setDraft("");
  };

  return (
    <div className={styles.backdrop} role="presentation" onClick={onCancel}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wg-glossary-bl-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wg-glossary-bl-title" className={styles.title}>
          {t("glossary.blacklistManageTitle")}
        </h2>
        <p className={styles.hint}>
          {t("glossary.blacklistManageHint", { title })}
        </p>

        <div className={local.list}>
          {items.length === 0 ? (
            <span className={local.empty}>{t("glossary.blacklistEmpty")}</span>
          ) : (
            items.map((phrase) => (
              <div key={phrase} className={local.row}>
                <span className={local.phrase}>{phrase}</span>
                <button
                  type="button"
                  className={local.remove}
                  aria-label={t("glossary.blacklistRemove", { name: phrase })}
                  onClick={() =>
                    setItems((prev) => prev.filter((x) => x !== phrase))
                  }
                >
                  {t("glossary.blacklistRemoveBtn")}
                </button>
              </div>
            ))
          )}
        </div>

        <div className={local.addRow}>
          <input
            className={local.input}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDraft();
              }
            }}
            placeholder={t("glossary.blacklistPlaceholder")}
            maxLength={64}
            autoFocus
          />
          <button
            type="button"
            className={styles.ghost}
            disabled={!draft.trim()}
            onClick={addDraft}
          >
            {t("glossary.blacklistAdd")}
          </button>
        </div>
        {error ? <p className={local.error}>{error}</p> : null}

        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onCancel}>
            {t("glossary.blacklistCancel")}
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => onSave(normalizePhrases(items))}
          >
            {t("glossary.blacklistSave")}
          </button>
        </div>
      </div>
    </div>
  );
}
