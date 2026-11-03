/**
 * 工作区「已打开」页签：顺序稳定；右键可关本页 / 其它 / 全部。
 */

import { useEffect, useRef, useState } from "react";
import {
  isOpenedPageDirty,
  openedPageKey,
  resolveOpenedPageTitle,
  type OpenedPage,
  type ProjectTab,
} from "@/store/sessionStore";
import { useI18n } from "@/i18n/useI18n";
import styles from "./WorkspaceOpenTabs.module.css";

interface WorkspaceOpenTabsProps {
  tab: ProjectTab;
  active: OpenedPage | null;
  onSelect: (page: OpenedPage) => void;
  onClose: (page: OpenedPage) => void;
  onCloseOthers: (keep: OpenedPage) => void;
  onCloseAll: () => void;
}

type CtxMenu = {
  page: OpenedPage;
  x: number;
  y: number;
};

export function WorkspaceOpenTabs({
  tab,
  active,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseAll,
}: WorkspaceOpenTabsProps) {
  const { t } = useI18n();
  const pages = tab.openedPages ?? [];
  const [ctx, setCtx] = useState<CtxMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctx) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtx(null);
    };
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setCtx(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [ctx]);

  useEffect(() => {
    if (!ctx || !menuRef.current) return;
    const el = menuRef.current;
    const rect = el.getBoundingClientRect();
    let x = ctx.x;
    let y = ctx.y;
    if (x + rect.width > window.innerWidth - 8) {
      x = Math.max(8, window.innerWidth - rect.width - 8);
    }
    if (y + rect.height > window.innerHeight - 8) {
      y = Math.max(8, window.innerHeight - rect.height - 8);
    }
    if (x !== ctx.x || y !== ctx.y) setCtx({ ...ctx, x, y });
  }, [ctx]);

  if (pages.length < 2) return null;

  return (
    <>
      <div
        className={styles.bar}
        role="tablist"
        aria-label={t("editor.openedPages")}
      >
        {pages.map((page) => {
          const title = resolveOpenedPageTitle(tab, page);
          const isActive =
            Boolean(active) &&
            active!.scope === page.scope &&
            active!.id === page.id;
          const dirty = isOpenedPageDirty(tab, page);
          return (
            <div
              key={openedPageKey(page)}
              className={styles.tab}
              data-active={isActive || undefined}
              data-scope={page.scope}
              data-dirty={dirty || undefined}
              role="tab"
              aria-selected={isActive}
              title={
                dirty ? `${title} · ${t("editor.openedPageDirty")}` : title
              }
              onClick={() => onSelect(page)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCtx({ page, x: e.clientX, y: e.clientY });
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onClose(page);
                }
              }}
            >
              <span className={styles.label}>
                {dirty ? "• " : ""}
                {title}
              </span>
              <button
                type="button"
                className={styles.close}
                aria-label={t("editor.closeOpenedPage", { name: title })}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(page);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      {ctx ? (
        <div
          ref={menuRef}
          className={styles.ctxMenu}
          style={{ left: ctx.x, top: ctx.y }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className={styles.ctxItem}
            onClick={() => {
              onClose(ctx.page);
              setCtx(null);
            }}
          >
            {t("editor.closeOpenedPage", {
              name: resolveOpenedPageTitle(tab, ctx.page),
            })}
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.ctxItem}
            disabled={pages.length < 2}
            onClick={() => {
              onCloseOthers(ctx.page);
              setCtx(null);
            }}
          >
            {t("editor.closeOtherOpenedPages")}
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.ctxItem}
            onClick={() => {
              onCloseAll();
              setCtx(null);
            }}
          >
            {t("editor.closeAllOpenedPages")}
          </button>
        </div>
      ) : null}
    </>
  );
}
