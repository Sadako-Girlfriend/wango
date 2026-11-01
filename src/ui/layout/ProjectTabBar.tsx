/**
 * 项目选项卡：切换 / 关闭；双击标题可改项目名。
 */

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import {
  displayTabTitle,
  type ProjectTab,
} from "@/store/sessionStore";
import styles from "./ProjectTabBar.module.css";

interface ProjectTabBarProps {
  tabs: ProjectTab[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onRename: (tabId: string, name: string) => void;
}

export function ProjectTabBar({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onRename,
}: ProjectTabBarProps) {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingId]);

  if (!tabs.length) return null;

  const commit = (tabId: string) => {
    const next = draft.trim() || t("project.untitled");
    onRename(tabId, next);
    setEditingId(null);
  };

  return (
    <div className={styles.bar} role="tablist" aria-label={t("project.tabs")}>
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const dirty =
          !tab.filePath
            ? tab.touched || tab.revision > 0
            : tab.revision > tab.syncedRevision;
        const title = displayTabTitle(tab);
        const editing = editingId === tab.id;

        return (
          <div
            key={tab.id}
            className={styles.tab}
            data-active={active || undefined}
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!editing) onSelect(tab.id);
            }}
            title={t("project.renameHint")}
          >
            {editing ? (
              <input
                ref={inputRef}
                className={styles.edit}
                value={draft}
                aria-label={t("project.name")}
                onChange={(e) => setDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => commit(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commit(tab.id);
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setEditingId(null);
                  }
                }}
              />
            ) : (
              <span
                className={styles.label}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onSelect(tab.id);
                  setDraft(title);
                  setEditingId(tab.id);
                }}
              >
                {dirty ? "• " : ""}
                {title}
              </span>
            )}
            <button
              type="button"
              className={styles.close}
              aria-label={t("project.closeTab", { name: title })}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
