/**
 * 顶部栏：项目名、灵感、Agent、设置；新建 / 文件收进二级菜单，避免窄窗挤爆。
 */

import { useEffect, useRef, useState } from "react";
import type { RecentEntry } from "@/desktop/sessionPersist";
import { templateNameKey } from "@/i18n";
import { useI18n } from "@/i18n/useI18n";
import { listTemplates } from "@/plugins";
import styles from "./Header.module.css";

export type { ExportKind } from "./ExportDialog";
export type InspireMode = "refine" | "sentence" | "outline";

interface HeaderProps {
  /** 编辑态才显示项目名与文件菜单 */
  editorMode: boolean;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  recents: RecentEntry[];
  openFilePaths: Set<string>;
  onOpenRecent: (entry: RecentEntry) => void;
  /** 请求处理最近项（弹窗：移出 / 永久删除） */
  onRemoveRecent: (entry: RecentEntry) => void;
  onNewFromTemplate: (pluginId: string) => void;
  /** 从粘贴导入大纲（编辑态） */
  onPasteImport?: () => void;
  /** 从文件导入大纲（编辑态） */
  onFileImport?: () => void;
  onImport: () => void;
  /** 有路径则覆盖；无路径则另存为 */
  onSave: () => void;
  /** 打开导出格式弹窗 */
  onOpenExport: () => void;
  onOpenSettings: () => void;
  /** 编辑态：切换右侧 Agent */
  agentOpen?: boolean;
  onToggleAgent?: () => void;
  /** 返回 true 表示 API 已配置，可展开灵感菜单 */
  onInspireGate: () => boolean | Promise<boolean>;
  onInspireMode: (mode: InspireMode) => void;
  /** idle 普通灵感；generating 显示生成中（悬停变取消）；cancelling 取消中 */
  inspirePhase?: "idle" | "generating" | "cancelling";
  onInspireCancel?: () => void;
  saveError: string | null;
}

export function Header({
  editorMode,
  projectName,
  onProjectNameChange,
  recents,
  openFilePaths,
  onOpenRecent,
  onRemoveRecent,
  onNewFromTemplate,
  onPasteImport,
  onFileImport,
  onImport,
  onSave,
  onOpenExport,
  onOpenSettings,
  agentOpen = false,
  onToggleAgent,
  onInspireGate,
  onInspireMode,
  inspirePhase = "idle",
  onInspireCancel,
  saveError,
}: HeaderProps) {
  const { t } = useI18n();
  const templates = listTemplates();
  const [newOpen, setNewOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [inspireHover, setInspireHover] = useState(false);
  const inspireBusy = inspirePhase !== "idle";
  const [projOpen, setProjOpen] = useState(false);
  const [inspireOpen, setInspireOpen] = useState(false);
  const newRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLDivElement>(null);
  const projRef = useRef<HTMLDivElement>(null);
  const inspireRef = useRef<HTMLDivElement>(null);

  /** 仅已保存的 .wango；未另存草稿不进「其他项目」 */
  const otherRecents = recents.filter((r) => {
    if (!r.filePath) return false;
    return !openFilePaths.has(r.filePath.replace(/\\/g, "/"));
  });

  const closeAll = () => {
    setNewOpen(false);
    setFileOpen(false);
    setProjOpen(false);
    setInspireOpen(false);
  };

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const tnode = e.target as Node;
      if (newRef.current && !newRef.current.contains(tnode)) setNewOpen(false);
      if (fileRef.current && !fileRef.current.contains(tnode)) {
        setFileOpen(false);
      }
      if (projRef.current && !projRef.current.contains(tnode)) setProjOpen(false);
      if (inspireRef.current && !inspireRef.current.contains(tnode)) {
        setInspireOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {editorMode && (
          <input
            className={styles.projectName}
            value={projectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            onBlur={() => {
              if (!projectName.trim()) {
                onProjectNameChange(t("project.untitled"));
              }
            }}
            placeholder={t("project.name")}
            aria-label={t("project.name")}
            title={t("project.nameHint")}
          />
        )}
        {saveError && (
          <span className={styles.saveErr} title={saveError}>
            {t("header.saveFailed")}
          </span>
        )}
      </div>
      <div className={styles.right}>
        <div className={styles.menuWrap} ref={inspireRef}>
          <button
            type="button"
            className={[
              styles.btn,
              inspirePhase === "generating" ? styles.inspireBreath : "",
              inspirePhase === "cancelling" ? styles.inspireCancelling : "",
            ]
              .filter(Boolean)
              .join(" ")}
            title={
              inspirePhase === "cancelling"
                ? t("inspire.cancelling")
                : inspirePhase === "generating" && inspireHover
                  ? t("inspire.cancel")
                  : inspirePhase === "generating"
                    ? t("inspire.generatingShort")
                    : t("inspire.title")
            }
            aria-label={
              inspirePhase === "cancelling"
                ? t("inspire.cancelling")
                : inspirePhase === "generating"
                  ? t("inspire.generatingShort")
                  : t("inspire.title")
            }
            aria-expanded={inspirePhase === "idle" ? inspireOpen : undefined}
            aria-haspopup={inspirePhase === "idle" ? "menu" : undefined}
            aria-busy={inspireBusy || undefined}
            disabled={inspirePhase === "cancelling"}
            onMouseEnter={() => setInspireHover(true)}
            onMouseLeave={() => setInspireHover(false)}
            onClick={() => {
              if (inspirePhase === "cancelling") return;
              if (inspirePhase === "generating") {
                onInspireCancel?.();
                return;
              }
              void (async () => {
                const ok = await onInspireGate();
                if (!ok) {
                  setInspireOpen(false);
                  return;
                }
                setInspireOpen((v) => !v);
                setNewOpen(false);
                setFileOpen(false);
                setProjOpen(false);
              })();
            }}
          >
            <span
              className={styles.inspireIcon}
              aria-hidden
              data-visible={inspirePhase === "idle" || undefined}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 18h6M10 21h4"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
                <path
                  d="M12 3a6 6 0 0 0-3.5 10.8c.6.45 1 1.1 1.1 1.85V17h4.8v-1.35c.1-.75.5-1.4 1.1-1.85A6 6 0 0 0 12 3Z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className={styles.inspireLabelStack} aria-hidden>
              {(
                [
                  ["idle", t("inspire.title")],
                  ["generating", t("inspire.generatingShort")],
                  ["cancel", t("inspire.cancel")],
                  ["cancelling", t("inspire.cancelling")],
                ] as const
              ).map(([key, label]) => {
                const on =
                  (inspirePhase === "idle" && key === "idle") ||
                  (inspirePhase === "cancelling" && key === "cancelling") ||
                  (inspirePhase === "generating" &&
                    inspireHover &&
                    key === "cancel") ||
                  (inspirePhase === "generating" &&
                    !inspireHover &&
                    key === "generating");
                return (
                  <span
                    key={key}
                    className={on ? styles.inspireLabelOn : styles.inspireLabelOff}
                  >
                    {label}
                  </span>
                );
              })}
            </span>
          </button>
          {inspirePhase === "idle" && inspireOpen && (
            <div className={styles.inspireMenu} role="menu">
              <button
                type="button"
                role="menuitem"
                className={styles.inspireItem}
                disabled={!editorMode}
                title={t("inspire.refineHint")}
                onClick={() => {
                  if (!editorMode) return;
                  setInspireOpen(false);
                  onInspireMode("refine");
                }}
              >
                <span className={styles.inspireItemTitle}>
                  {t("inspire.refine")}
                </span>
                <span className={styles.inspireItemDesc}>
                  {t("inspire.refineHint")}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.inspireItem}
                title={t("inspire.sentenceHint")}
                onClick={() => {
                  setInspireOpen(false);
                  onInspireMode("sentence");
                }}
              >
                <span className={styles.inspireItemTitle}>
                  {t("inspire.sentence")}
                </span>
                <span className={styles.inspireItemDesc}>
                  {t("inspire.sentenceHint")}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.inspireItem}
                title={t("inspire.outlineHint")}
                onClick={() => {
                  setInspireOpen(false);
                  onInspireMode("outline");
                }}
              >
                <span className={styles.inspireItemTitle}>
                  {t("inspire.outline")}
                </span>
                <span className={styles.inspireItemDesc}>
                  {t("inspire.outlineHint")}
                </span>
              </button>
            </div>
          )}
        </div>

        {editorMode && onToggleAgent ? (
          <button
            type="button"
            className={styles.btn}
            data-active={agentOpen || undefined}
            aria-pressed={agentOpen}
            onClick={onToggleAgent}
            title={
              agentOpen ? t("layout.collapseAgent") : t("layout.expandAgent")
            }
          >
            {t("agent.toggle")}
          </button>
        ) : null}

        <button type="button" className={styles.btn} onClick={onOpenSettings}>
          {t("header.settings")}
        </button>

        {editorMode && (
          <>
            <div className={styles.menuWrap} ref={projRef}>
              <button
                type="button"
                className={styles.btn}
                aria-expanded={projOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setProjOpen((v) => !v);
                  setInspireOpen(false);
                  setNewOpen(false);
                  setFileOpen(false);
                }}
              >
                {t("project.other")}
              </button>
              {projOpen && (
                <div
                  className={`${styles.menu} ${styles.menuScroll}`}
                  role="menu"
                >
                  {otherRecents.length === 0 ? (
                    <div className={styles.menuHint} role="note">
                      {t("project.otherEmpty")}
                    </div>
                  ) : (
                    otherRecents.map((r) => (
                      <div key={r.key} className={styles.menuRow} role="none">
                        <button
                          type="button"
                          role="menuitem"
                          className={styles.menuRowOpen}
                          title={r.filePath || r.title}
                          onClick={() => {
                            onOpenRecent(r);
                            closeAll();
                          }}
                        >
                          {r.title}
                        </button>
                        <button
                          type="button"
                          className={styles.menuRowDel}
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
                      </div>
                    ))
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItemAccent}
                    onClick={() => {
                      onImport();
                      closeAll();
                    }}
                  >
                    {t("header.open")}…
                  </button>
                </div>
              )}
            </div>

            <div className={styles.menuWrap} ref={newRef}>
              <button
                type="button"
                className={styles.btnPrimary}
                aria-expanded={newOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setNewOpen((v) => !v);
                  setInspireOpen(false);
                  setFileOpen(false);
                  setProjOpen(false);
                }}
              >
                {t("header.new")}
                <span className={styles.caret} aria-hidden>
                  ▾
                </span>
              </button>
              {newOpen && (
                <div className={styles.menu} role="menu">
                  <div className={styles.menuSectionLabel} role="presentation">
                    {t("header.newFromTemplate")}
                  </div>
                  {templates.map((tpl) => {
                    const key = templateNameKey(tpl.id);
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onNewFromTemplate(tpl.id);
                          closeAll();
                        }}
                      >
                        {key ? t(key) : tpl.name}
                      </button>
                    );
                  })}
                  {(onFileImport || onPasteImport) && (
                    <div className={styles.menuDivider} role="separator" />
                  )}
                  {onFileImport && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onFileImport();
                        closeAll();
                      }}
                    >
                      {t("header.fileImport")}
                    </button>
                  )}
                  {onPasteImport && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onPasteImport();
                        closeAll();
                      }}
                    >
                      {t("header.pasteImport")}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className={styles.menuWrap} ref={fileRef}>
              <button
                type="button"
                className={styles.btn}
                aria-expanded={fileOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setFileOpen((v) => !v);
                  setNewOpen(false);
                  setProjOpen(false);
                  setInspireOpen(false);
                }}
              >
                {t("header.file")}
                <span className={styles.caret} aria-hidden>
                  ▾
                </span>
              </button>
              {fileOpen && (
                <div className={styles.menu} role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onImport();
                      closeAll();
                    }}
                  >
                    {t("header.open")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onSave();
                      closeAll();
                    }}
                  >
                    {t("header.save")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenExport();
                      closeAll();
                    }}
                  >
                    {t("header.export")}…
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
