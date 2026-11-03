/**
 * 词条浮卡：多标签预览 + 谁引用了我；不抢工作区。
 * 单击高亮打开；「在词表中打开」/双击才进词表编辑。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  findGlossaryById,
  findNodeById,
  getNumberById,
  isManualLink,
  plainBodyPreview,
  resolveGlossaryContent,
  resolveGlossaryTitle,
  snippetAround,
  type GlossaryNode,
  type ProjectData,
  type TreeNode,
} from "@/domain";
import { useI18n } from "@/i18n/useI18n";
import styles from "./GlossaryPeekPanel.module.css";

const MAX_TABS = 8;

export type GlossaryBacklink = {
  linkId: string;
  hostNodeId: string;
  hostLabel: string;
  snippet: string;
  manual: boolean;
};

export function collectGlossaryBacklinks(
  project: ProjectData,
  entryId: string,
): GlossaryBacklink[] {
  const out: GlossaryBacklink[] = [];
  for (const l of project.glossaryLinks) {
    if (l.entryId !== entryId) continue;
    if (l.status !== "active" && l.status !== "modified") continue;
    const hostLabel = formatHostLabel(
      project.tree,
      project.glossary,
      l.hostNodeId,
    );
    const content = hostContentOf(project, l.hostNodeId);
    const snippet =
      content != null
        ? snippetAround(content, l.start, l.end)
        : l.matchedText || l.anchorText || "";
    out.push({
      linkId: l.id,
      hostNodeId: l.hostNodeId,
      hostLabel,
      snippet,
      manual: isManualLink(l),
    });
  }
  // 手动在前，再按宿主名
  out.sort((a, b) => {
    if (a.manual !== b.manual) return a.manual ? -1 : 1;
    return a.hostLabel.localeCompare(b.hostLabel, "zh");
  });
  return out;
}

function hostContentOf(project: ProjectData, hostId: string): string | null {
  const n = findNodeById(project.tree, hostId);
  if (n) return n.content;
  const g = findGlossaryById(project.glossary, hostId);
  if (g) return resolveGlossaryContent(g, project.tree);
  return null;
}

function formatHostLabel(
  tree: TreeNode[],
  glossary: GlossaryNode[],
  hostId: string,
): string {
  const n = findNodeById(tree, hostId);
  if (n) {
    const num = getNumberById(tree, hostId);
    return num ? `${num} ${n.title}` : n.title;
  }
  const g = findGlossaryById(glossary, hostId);
  if (g) return resolveGlossaryTitle(g, tree);
  return hostId.slice(0, 8);
}

interface GlossaryPeekPanelProps {
  project: ProjectData;
  /** 打开的词条 id（有序） */
  tabIds: string[];
  activeId: string;
  x: number;
  y: number;
  onActivate: (entryId: string) => void;
  onCloseTab: (entryId: string) => void;
  onClose: () => void;
  onOpenInGlossary: (entryId: string) => void;
  onJumpHost: (hostNodeId: string) => void;
}

export function GlossaryPeekPanel({
  project,
  tabIds,
  activeId,
  x,
  y,
  onActivate,
  onCloseTab,
  onClose,
  onOpenInGlossary,
  onJumpHost,
}: GlossaryPeekPanelProps) {
  const { t } = useI18n();
  const [pos, setPos] = useState({ x, y });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    setPos({ x, y });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const entry = findGlossaryById(project.glossary, activeId);
  const title = entry
    ? resolveGlossaryTitle(entry, project.tree)
    : activeId;
  const aliases = (entry?.aliases ?? []).filter(Boolean);
  const summary = entry
    ? plainBodyPreview(resolveGlossaryContent(entry, project.tree), 280)
    : "";
  const backlinks = useMemo(
    () => collectGlossaryBacklinks(project, activeId),
    [project, activeId],
  );

  const onHeadDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  };
  const onHeadMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPos({
      x: Math.max(8, e.clientX - dragRef.current.dx),
      y: Math.max(8, e.clientY - dragRef.current.dy),
    });
  };
  const onHeadUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const tabTitle = (id: string) => {
    const n = findGlossaryById(project.glossary, id);
    return n ? resolveGlossaryTitle(n, project.tree) : id.slice(0, 6);
  };

  return createPortal(
    <div
      className={styles.panel}
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label={t("glossary.peekTitle")}
    >
      <div
        className={styles.head}
        onPointerDown={onHeadDown}
        onPointerMove={onHeadMove}
        onPointerUp={onHeadUp}
      >
        <div className={styles.tabs}>
          {tabIds.map((id) => (
            <button
              key={id}
              type="button"
              className={styles.tab}
              data-active={id === activeId || undefined}
              title={tabTitle(id)}
              onClick={() => onActivate(id)}
            >
              {tabTitle(id)}
              {tabIds.length > 1 ? (
                <span
                  className={styles.tabClose}
                  role="presentation"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(id);
                  }}
                >
                  ×
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label={t("glossary.peekClose")}
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className={styles.body}>
        <h2 className={styles.title}>{title}</h2>
        {aliases.length ? (
          <p className={styles.aliases}>
            {t("glossary.peekAliases", { list: aliases.join("、") })}
          </p>
        ) : null}
        <p className={styles.summary}>
          {summary || t("glossary.peekNoBody")}
        </p>

        <p className={styles.sectionLabel}>
          {t("glossary.peekBacklinks", { count: String(backlinks.length) })}
        </p>
        {backlinks.length === 0 ? (
          <p className={styles.backEmpty}>{t("glossary.peekBacklinksEmpty")}</p>
        ) : (
          <div className={styles.backList}>
            {backlinks.map((b) => (
              <button
                key={b.linkId}
                type="button"
                className={styles.backItem}
                onClick={() => onJumpHost(b.hostNodeId)}
              >
                <span className={styles.backHost}>
                  {b.hostLabel}
                  {!b.manual ? ` · ${t("glossary.peekSuspected")}` : ""}
                </span>
                <span className={styles.backSnippet}>{b.snippet}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.foot}>
        <button type="button" className={styles.ghost} onClick={onClose}>
          {t("glossary.peekClose")}
        </button>
        <button
          type="button"
          className={styles.primary}
          onClick={() => onOpenInGlossary(activeId)}
        >
          {t("glossary.peekOpenGlossary")}
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** 合并新打开的词条到标签列表（有上限） */
export function mergePeekTabs(
  prev: string[],
  incoming: string[],
  focusId: string,
): { tabs: string[]; activeId: string } {
  const tabs = [...prev];
  for (const id of incoming) {
    if (!tabs.includes(id)) tabs.push(id);
  }
  while (tabs.length > MAX_TABS) {
    const drop = tabs.find((id) => id !== focusId) ?? tabs[0];
    const i = tabs.indexOf(drop);
    if (i >= 0) tabs.splice(i, 1);
    else break;
  }
  const activeId = tabs.includes(focusId) ? focusId : tabs[0] ?? focusId;
  return { tabs, activeId };
}
