/**
 * 词条别名管理：扫链 / 疑似提及会认这些名字。
 */

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import styles from "@/ui/layout/InspirePromptDialog.module.css";
import local from "./GlossaryBlacklistDialog.module.css";

interface GlossaryAliasesDialogProps {
  termTitle: string;
  aliases: string[];
  onSave: (aliases: string[]) => void;
  onCancel: () => void;
}

function normalizeAliases(list: string[], title: string): string[] {
  const titleNorm = title.trim();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const s = raw.trim();
    if (!s || s === titleNorm || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function GlossaryAliasesDialog({
  termTitle,
  aliases: initial,
  onSave,
  onCancel,
}: GlossaryAliasesDialogProps) {
  const { t } = useI18n();
  const title = termTitle.trim() || t("glossary.untitled");
  const [items, setItems] = useState(() => normalizeAliases(initial, title));
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const addDraft = () => {
    const phrase = draft.trim();
    if (!phrase) return;
    if (phrase === title) {
      setError(t("glossary.aliasesInvalid", { title }));
      return;
    }
    setError("");
    setItems((prev) => normalizeAliases([...prev, phrase], title));
    setDraft("");
  };

  return (
    <div className={styles.backdrop} role="presentation" onClick={onCancel}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wg-glossary-alias-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wg-glossary-alias-title" className={styles.title}>
          {t("glossary.aliasesManageTitle")}
        </h2>
        <p className={styles.hint}>
          {t("glossary.aliasesManageHint", { title })}
        </p>

        <div className={local.list}>
          {items.length === 0 ? (
            <span className={local.empty}>{t("glossary.aliasesEmpty")}</span>
          ) : (
            items.map((phrase) => (
              <div key={phrase} className={local.row}>
                <span className={local.phrase}>{phrase}</span>
                <button
                  type="button"
                  className={local.remove}
                  aria-label={t("glossary.aliasesRemove", { name: phrase })}
                  onClick={() =>
                    setItems((prev) => prev.filter((x) => x !== phrase))
                  }
                >
                  {t("glossary.aliasesRemoveBtn")}
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
            placeholder={t("glossary.aliasesPlaceholder")}
            maxLength={64}
            autoFocus
          />
          <button
            type="button"
            className={styles.ghost}
            disabled={!draft.trim()}
            onClick={addDraft}
          >
            {t("glossary.aliasesAdd")}
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
            onClick={() => onSave(normalizeAliases(items, title))}
          >
            {t("glossary.aliasesSave")}
          </button>
        </div>
      </div>
    </div>
  );
}
