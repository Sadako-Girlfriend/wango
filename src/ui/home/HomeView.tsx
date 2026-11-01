/**
 * 启动首页：居中布局（对齐 Cursor 欢迎页结构）；支持拖入 .wango。
 */

import { useRef, useState } from "react";
import type { RecentEntry } from "@/desktop/sessionPersist";
import { isWangoPath, openWangoPaths } from "@/desktop/osOpen";
import { useTauriFileDrop } from "@/desktop/useTauriFileDrop";
import { useI18n } from "@/i18n/useI18n";
import brandLogo from "@/assets/brand-logo.jpg";
import styles from "./HomeView.module.css";

const PREVIEW_COUNT = 5;

interface HomeViewProps {
  mode: "templates" | "history";
  recents: RecentEntry[];
  onOpenTemplate: (pluginId: string) => void;
  onOpenRecent: (entry: RecentEntry) => void;
  onRemoveRecent: (entry: RecentEntry) => void;
  onOpenFile: () => void;
}

function FolderIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M14 3.5V9h5.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function TreeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v6M12 10H7.5a2 2 0 0 0-2 2v2M12 10h4.5a2 2 0 0 1 2 2v2M7.5 14v4M16.5 14v4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="4" r="1.6" fill="currentColor" />
      <circle cx="7.5" cy="18.5" r="1.6" fill="currentColor" />
      <circle cx="16.5" cy="18.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

function pickWangoPaths(paths: string[]): string[] {
  return paths.filter(isWangoPath);
}

export function HomeView({
  recents,
  onOpenTemplate,
  onOpenRecent,
  onRemoveRecent,
  onOpenFile,
}: HomeViewProps) {
  const { t } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  /** 首页最近列表同样只展示已保存项目 */
  const savedRecents = recents.filter((r) => Boolean(r.filePath));
  const visible = showAll
    ? savedRecents
    : savedRecents.slice(0, PREVIEW_COUNT);
  const hasMore = savedRecents.length > PREVIEW_COUNT;

  const ingestPaths = (paths: string[]) => {
    const wango = pickWangoPaths(paths);
    if (!wango.length) {
      window.alert(t("home.dropNoWango"));
      return;
    }
    void openWangoPaths(wango);
  };

  useTauriFileDrop({
    enabled: true,
    onHover: setDragging,
    onDropPaths: ingestPaths,
  });

  const onDragEnter = (e: React.DragEvent) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    // Tauri Windows 上路径主要靠原生事件；浏览器预览用 file.name 兜底
    const fromFiles = [...e.dataTransfer.files]
      .map((f) => {
        const withPath = f as File & { path?: string };
        return withPath.path || f.name;
      })
      .filter(Boolean);
    if (fromFiles.length) ingestPaths(fromFiles);
  };

  return (
    <div
      className={styles.root}
      data-drop={dragging || undefined}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {dragging && (
        <div className={styles.dropMask}>{t("home.dropHint")}</div>
      )}
      <div className={styles.stack}>
        <div className={styles.brandBlock}>
          <img
            className={styles.brandLogo}
            src={brandLogo}
            alt={`${t("app.brand")} ${t("app.brandEn")}`}
            draggable={false}
          />
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.action} onClick={onOpenFile}>
            <span className={styles.actionIcon}>
              <FolderIcon />
            </span>
            <span className={styles.actionLabel}>{t("home.openProject")}</span>
          </button>
          <button
            type="button"
            className={styles.action}
            onClick={() => onOpenTemplate("template.empty")}
          >
            <span className={styles.actionIcon}>
              <DocIcon />
            </span>
            <span className={styles.actionLabel}>{t("home.emptyProject")}</span>
          </button>
          <button
            type="button"
            className={styles.action}
            onClick={() => onOpenTemplate("template.sample")}
          >
            <span className={styles.actionIcon}>
              <TreeIcon />
            </span>
            <span className={styles.actionLabel}>
              {t("home.sampleProject")}
            </span>
          </button>
        </div>

        <section className={styles.recent}>
          <div className={styles.recentHead}>
            <h2>{t("home.recent")}</h2>
            {hasMore && (
              <button
                type="button"
                className={styles.viewAll}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll
                  ? t("home.collapse")
                  : t("home.viewAll", { count: savedRecents.length })}
              </button>
            )}
          </div>

          {savedRecents.length === 0 ? (
            <p className={styles.empty}>{t("home.noRecent")}</p>
          ) : (
            <ul className={styles.list}>
              {visible.map((r) => (
                <li key={r.key} className={styles.rowWrap}>
                  <button
                    type="button"
                    className={styles.row}
                    onClick={() => onOpenRecent(r)}
                  >
                    <span className={styles.rowTitle}>{r.title}</span>
                    <span className={styles.rowPath}>
                      {r.filePath ?? t("project.unsavedDraft")}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.rowDel}
                    aria-label={t("project.removeRecent")}
                    title={t("project.removeRecent")}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRemoveRecent(r);
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
