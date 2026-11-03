/**
 * 单行树节点：整行可拖；搜索命中行高亮，标题内匹配片段 mark。
 */

import { useEffect, useRef, type ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { DropPlacement, NodePriority, NumberedTreeNode } from "@/domain";
import type { MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/useI18n";
import { PriorityIcon } from "./PriorityIcon";
import styles from "./TreePane.module.css";

interface TreeNodeRowProps {
  node: NumberedTreeNode;
  depth: number;
  selectedId: string | null;
  collapsedIds: Record<string, true>;
  dragEnabled: boolean;
  matchQuery: string;
  matchIds: Set<string>;
  currentMatchId: string | null;
  /** 本帧新建、需要入场动画的节点 id */
  enteringIds: Set<string>;
  overId: string | null;
  dropPlacement: DropPlacement | null;
  renamingId: string | null;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onContextMenu: (id: string, clientX: number, clientY: number) => void;
}

export function TreeNodeRow({
  node,
  depth,
  selectedId,
  collapsedIds,
  dragEnabled,
  matchQuery,
  matchIds,
  currentMatchId,
  enteringIds,
  overId,
  dropPlacement,
  renamingId,
  renameDraft,
  onRenameDraftChange,
  onCommitRename,
  onCancelRename,
  onSelect,
  onToggle,
  onContextMenu,
}: TreeNodeRowProps) {
  const { t } = useI18n();
  const hasChildren = node.children.length > 0;
  const collapsed = Boolean(collapsedIds[node.id]);
  const selected = selectedId === node.id;
  const isMatch = matchIds.has(node.id);
  const isCurrent = currentMatchId === node.id;
  const isEntering = enteringIds.has(node.id);
  const showDrop = overId === node.id && dropPlacement;
  const renaming = renamingId === node.id;
  const suppressClickRef = useRef(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: node.id,
    disabled: !dragEnabled || renaming,
  });

  const { setNodeRef: setDropRef } = useDroppable({
    id: node.id,
    disabled: !dragEnabled || renaming,
  });

  useEffect(() => {
    if (isDragging) suppressClickRef.current = true;
  }, [isDragging]);

  useEffect(() => {
    if (!renaming) return;
    const el = renameInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [renaming]);

  const setRefs = (el: HTMLDivElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };

  return (
    <>
      <div
        ref={setRefs}
        className={styles.row}
        style={{
          paddingLeft: 8 + depth * 14,
          opacity: isDragging ? 0.35 : 1,
        }}
        data-node-id={node.id}
        data-selected={selected || undefined}
        data-match={isMatch || undefined}
        data-match-current={isCurrent || undefined}
        data-enter={isEntering || undefined}
        data-drop={showDrop ? dropPlacement : undefined}
        data-dragging={isDragging || undefined}
        data-draggable={dragEnabled && !renaming ? true : undefined}
        data-renaming={renaming || undefined}
        aria-selected={selected}
        aria-expanded={hasChildren ? !collapsed : undefined}
        {...(dragEnabled && !renaming ? { ...listeners, ...attributes } : {})}
        role="treeitem"
        onClick={(e) => {
          if (renaming) return;
          const target = e.target as HTMLElement | null;
          if (target?.closest(`.${styles.twist}`)) return;
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          // 双击判定在 TreePane.handleRowClick（带超时重置），不用浏览器 dblclick
          onSelect(node.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (renaming) return;
          onContextMenu(node.id, e.clientX, e.clientY);
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            className={styles.twist}
            aria-label={collapsed ? t("tree.expand") : t("tree.collapseNode")}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            {collapsed ? "▸" : "▾"}
          </button>
        ) : (
          <span className={styles.twistMuted} />
        )}
        <span className={styles.number}>{node.number}</span>
        {renaming ? (
          <input
            ref={renameInputRef}
            className={styles.renameInput}
            value={renameDraft}
            aria-label={t("tree.menuRename")}
            title={t("tree.renameHint")}
            onChange={(e) => onRenameDraftChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={() => onCommitRename()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                onCommitRename();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onCancelRename();
              }
            }}
          />
        ) : (
          <span className={styles.title} title={t("tree.renameHint")}>
            {highlightTitle(node.title, matchQuery)}
          </span>
        )}
        {node.priority ? (
          <PriorityIcon
            priority={node.priority}
            className={styles.prio}
            title={priorityTitle(node.priority, t)}
          />
        ) : null}
        {(node.labels ?? []).slice(0, 3).map((lab) => (
          <span key={lab} className={styles.labelChip} title={lab}>
            {lab}
          </span>
        ))}
        {(node.labels?.length ?? 0) > 3 ? (
          <span className={styles.labelMore}>
            +{(node.labels!.length - 3)}
          </span>
        ) : null}
      </div>
      {hasChildren &&
        !collapsed &&
        node.children.map((child) => (
          <TreeNodeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            collapsedIds={collapsedIds}
            dragEnabled={dragEnabled}
            matchQuery={matchQuery}
            matchIds={matchIds}
            currentMatchId={currentMatchId}
            enteringIds={enteringIds}
            overId={overId}
            dropPlacement={dropPlacement}
            renamingId={renamingId}
            renameDraft={renameDraft}
            onRenameDraftChange={onRenameDraftChange}
            onCommitRename={onCommitRename}
            onCancelRename={onCancelRename}
            onSelect={onSelect}
            onToggle={onToggle}
            onContextMenu={onContextMenu}
          />
        ))}
    </>
  );
}

function priorityTitle(
  p: NodePriority,
  t: (key: MessageKey) => string,
): string {
  if (p === "high") return t("tree.priorityHigh");
  if (p === "medium") return t("tree.priorityMedium");
  return t("tree.priorityLow");
}

function highlightTitle(title: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return title;
  const lower = title.toLowerCase();
  const needle = q.toLowerCase();
  const parts: ReactNode[] = [];
  let start = 0;
  let idx = lower.indexOf(needle);
  let key = 0;
  if (idx < 0) return title;
  while (idx >= 0) {
    if (idx > start) parts.push(title.slice(start, idx));
    parts.push(
      <mark key={key} className={styles.mark}>
        {title.slice(idx, idx + needle.length)}
      </mark>,
    );
    key += 1;
    start = idx + needle.length;
    idx = lower.indexOf(needle, start);
  }
  if (start < title.length) parts.push(title.slice(start));
  return parts;
}

/** 在编号树中查找展示文案，供拖拽浮层使用 */
export function findNumberedLabel(
  nodes: NumberedTreeNode[],
  id: string,
): string | null {
  for (const node of nodes) {
    if (node.id === id) return `${node.number} ${node.title}`;
    const nested = findNumberedLabel(node.children, id);
    if (nested) return nested;
  }
  return null;
}
