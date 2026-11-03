/**
 * 左侧树栏：拖拽 + 标题定位高亮（不裁剪树）+ 右键菜单。
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  collectAllIds,
  collectAncestorIds,
  collectTitleMatches,
  findNodeById,
  placementFromRatio,
  resolveDropTarget,
  type DropPlacement,
  type NodePriority,
  type NumberedTreeNode,
  type TreeNode,
} from "@/domain";
import { useI18n } from "@/i18n/useI18n";
import { NodeLabelsDialog } from "./NodeLabelsDialog";
import { placeFixedMenu } from "./placeFixedMenu";
import { PriorityIcon } from "./PriorityIcon";
import { TreeNodeRow, findNumberedLabel } from "./TreeNodeRow";
import styles from "./TreePane.module.css";

interface TreePaneProps {
  /** 切换 tab 时重跑定位；编辑正文不触发 */
  locateKey: string;
  nodes: NumberedTreeNode[];
  sourceTree: TreeNode[];
  selectedId: string | null;
  collapsedIds: Record<string, true>;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onExpandNodes: (ids: string[]) => void;
  onMove: (id: string, parentId: string | null, index: number) => void;
  onAddChild: (parentId: string | null) => void;
  onAddSibling: (afterId: string) => void;
  onCopy: (id: string) => void;
  onPaste: (afterId: string | null) => void;
  canPaste: boolean;
  onPromote: () => void;
  onDemote: () => void;
  /** 释放子节点（父保留） */
  onReleaseChildren: (id: string) => void;
  /** 解散节点（父删除，子提升） */
  onDissolve: (id: string) => void;
  onDelete: (id: string) => void;
  /** 就地重命名标题（F2 / 双击） */
  onRename: (id: string, title: string) => void;
  onSetPriority: (id: string, priority: NodePriority | null) => void;
  onSetLabels: (id: string, labels: string[]) => void;
  /** 引用为词条 */
  onReferenceGlossary?: (id: string) => void;
  /** 复制为词条 */
  onCopyGlossary?: (id: string) => void;
  /** 大纲节点是否已被引用为词条（删除提示） */
  isReferencedAsGlossary?: (id: string) => boolean;
}

interface CtxMenuState {
  nodeId: string;
  /** 右键锚点（视口坐标） */
  anchorX: number;
  anchorY: number;
  /** 校正后的菜单左上角 */
  x: number;
  y: number;
  /** 视口极矮时限制高度并滚动 */
  maxHeight?: number;
  /** 量完尺寸并落位后才显示，避免先错向再跳 */
  ready: boolean;
}

interface DeleteConfirmState {
  id: string;
  title: string;
  descendantCount: number;
}

export function TreePane({
  locateKey,
  nodes,
  sourceTree,
  selectedId,
  collapsedIds,
  searchQuery,
  onSearchChange,
  onSelect,
  onToggle,
  onExpandNodes,
  onMove,
  onAddChild,
  onAddSibling,
  onCopy,
  onPaste,
  canPaste,
  onPromote,
  onDemote,
  onReleaseChildren,
  onDissolve,
  onDelete,
  onRename,
  onSetPriority,
  onSetLabels,
  onReferenceGlossary,
  onCopyGlossary,
  isReferencedAsGlossary,
}: TreePaneProps) {
  const { t } = useI18n();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  /** 自管双击：同节点在时限内点第二次 → 重命名（不依赖浏览器 dblclick，避免未选中时要点三次） */
  const renameClickRef = useRef<{ id: string; at: number } | null>(null);
  const RENAME_DOUBLE_MS = 500;
  const [overId, setOverId] = useState<string | null>(null);
  const [dropPlacement, setDropPlacement] = useState<DropPlacement | null>(
    null,
  );
  const [matchIndex, setMatchIndex] = useState(0);
  /** 仅新建节点播入场动画；切 tab / 首屏不播 */
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set());
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  /** 优先级二级菜单：相对触发项定位 */
  const [prioSub, setPrioSub] = useState<{
    x: number;
    y: number;
    ready: boolean;
  } | null>(null);
  const [labelsEditId, setLabelsEditId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] =
    useState<DeleteConfirmState | null>(null);
  const [dissolveConfirm, setDissolveConfirm] =
    useState<DeleteConfirmState | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const locateSeenRef = useRef(locateKey);
  const lastHintRef = useRef<{ overId: string; placement: DropPlacement } | null>(
    null,
  );
  const listRef = useRef<HTMLDivElement>(null);
  const locateGenRef = useRef(0);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const prioItemRef = useRef<HTMLButtonElement>(null);
  const prioSubRef = useRef<HTMLDivElement>(null);
  const prioCloseTimerRef = useRef<number | null>(null);
  /** 右键期间锁定树滚动，防止选中重绘把列表带跑 */
  const ctxScrollLockRef = useRef<number | null>(null);

  useEffect(() => {
    const ids = collectAllIds(sourceTree);
    // 换项目 tab：整树换血，只记账不动画
    if (locateSeenRef.current !== locateKey) {
      locateSeenRef.current = locateKey;
      seenIdsRef.current = new Set(ids);
      setEnteringIds(new Set());
      return;
    }
    // 首屏：已有节点不算「新建」
    if (seenIdsRef.current.size === 0) {
      seenIdsRef.current = new Set(ids);
      return;
    }
    const fresh: string[] = [];
    for (const id of ids) {
      if (!seenIdsRef.current.has(id)) fresh.push(id);
    }
    const alive = new Set(ids);
    for (const id of [...seenIdsRef.current]) {
      if (!alive.has(id)) seenIdsRef.current.delete(id);
    }
    for (const id of fresh) seenIdsRef.current.add(id);
    if (!fresh.length) return;

    setEnteringIds((prev) => {
      const next = new Set(prev);
      for (const id of fresh) next.add(id);
      return next;
    });
    const timer = window.setTimeout(() => {
      setEnteringIds((prev) => {
        const next = new Set(prev);
        for (const id of fresh) next.delete(id);
        return next;
      });
    }, 380);
    return () => window.clearTimeout(timer);
  }, [sourceTree, locateKey]);

  const matchIds = useMemo(
    () => collectTitleMatches(sourceTree, searchQuery),
    [sourceTree, searchQuery],
  );
  const matchSet = useMemo(() => new Set(matchIds), [matchIds]);
  const q = searchQuery.trim();
  const currentMatchId =
    q && matchIds.length > 0
      ? matchIds[
          ((matchIndex % matchIds.length) + matchIds.length) % matchIds.length
        ]
      : null;

  // 关键字或切换 tab：展开祖先并定位到第一个命中（编辑正文不重跑）
  useEffect(() => {
    const gen = ++locateGenRef.current;
    if (!q) {
      setMatchIndex(0);
      return;
    }
    const matches = collectTitleMatches(sourceTree, q);
    setMatchIndex(0);
    if (!matches.length) return;
    onExpandNodes(collectAncestorIds(sourceTree, matches));
    onSelect(matches[0]);
    requestAnimationFrame(() => {
      if (gen !== locateGenRef.current) return;
      scrollToNode(listRef.current, matches[0]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 故意不订阅 sourceTree 引用
  }, [q, locateKey]);

  useEffect(() => {
    if (!ctxMenu) {
      setPrioSub(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (prioSub) {
        setPrioSub(null);
        return;
      }
      setCtxMenu(null);
    };
    const onPointer = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      const main = ctxMenuRef.current;
      const sub = prioSubRef.current;
      if (main?.contains(e.target) || sub?.contains(e.target)) return;
      setCtxMenu(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [ctxMenu, prioSub]);

  // 右键打开期间持续锁住树滚动
  useLayoutEffect(() => {
    if (!ctxMenu) {
      ctxScrollLockRef.current = null;
      return;
    }
    const list = listRef.current;
    const locked = ctxScrollLockRef.current;
    if (list && locked != null) list.scrollTop = locked;
  }, [ctxMenu, selectedId]);

  // 隐藏测量 → 按真实尺寸落位再显示（避免估算高度导致先上后下跳）
  useLayoutEffect(() => {
    if (!ctxMenu || ctxMenu.ready) return;
    const el = ctxMenuRef.current;
    if (!el) return;

    // 测量前去掉高度限制，拿到自然尺寸
    el.style.maxHeight = "none";
    const menuWidth = Math.max(el.offsetWidth, el.scrollWidth);
    const menuHeight = el.scrollHeight;
    const placed = placeFixedMenu({
      anchorX: ctxMenu.anchorX,
      anchorY: ctxMenu.anchorY,
      menuWidth,
      menuHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    setCtxMenu({
      ...ctxMenu,
      x: placed.x,
      y: placed.y,
      maxHeight: placed.maxHeight,
      ready: true,
    });
  }, [ctxMenu]);

  // 优先级二级菜单：相对触发项右侧展开，不够则翻到左侧
  useLayoutEffect(() => {
    if (!prioSub || prioSub.ready) return;
    const trigger = prioItemRef.current;
    const el = prioSubRef.current;
    if (!trigger || !el) return;

    const rect = trigger.getBoundingClientRect();
    const pad = 4;
    const menuWidth = Math.max(el.offsetWidth, el.scrollWidth, 140);
    const menuHeight = el.scrollHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceRight = vw - rect.right - pad;
    const spaceLeft = rect.left - pad;
    const openRight =
      spaceRight >= menuWidth ||
      (spaceRight >= spaceLeft && spaceRight >= 64);
    let x = openRight ? rect.right + 2 : rect.left - menuWidth - 2;
    x = Math.max(pad, Math.min(x, vw - menuWidth - pad));

    let y = rect.top;
    if (y + menuHeight > vh - pad) {
      y = Math.max(pad, vh - menuHeight - pad);
    }

    setPrioSub({ x, y, ready: true });
  }, [prioSub]);

  const cancelPriorityClose = () => {
    if (prioCloseTimerRef.current != null) {
      window.clearTimeout(prioCloseTimerRef.current);
      prioCloseTimerRef.current = null;
    }
  };

  const openPrioritySub = () => {
    cancelPriorityClose();
    setPrioSub((prev) => prev ?? { x: 0, y: 0, ready: false });
  };

  const closePrioritySub = () => {
    cancelPriorityClose();
    setPrioSub(null);
  };

  /** 离开触发项/子菜单时短暂延迟，方便鼠标移过去 */
  const schedulePriorityClose = () => {
    cancelPriorityClose();
    prioCloseTimerRef.current = window.setTimeout(() => {
      prioCloseTimerRef.current = null;
      setPrioSub(null);
    }, 160);
  };

  useEffect(
    () => () => {
      cancelPriorityClose();
    },
    [],
  );

  const goMatch = (delta: number) => {
    if (!matchIds.length) return;
    const next =
      (((matchIndex + delta) % matchIds.length) + matchIds.length) %
      matchIds.length;
    setMatchIndex(next);
    const id = matchIds[next];
    onExpandNodes(collectAncestorIds(sourceTree, [id]));
    onSelect(id);
    requestAnimationFrame(() => scrollToNode(listRef.current, id));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const resetDrag = () => {
    renameClickRef.current = null;
    setActiveId(null);
    setOverId(null);
    setDropPlacement(null);
    lastHintRef.current = null;
  };

  const updatePlacement = (event: DragMoveEvent | DragEndEvent) => {
    const over = event.over;
    if (!over || !event.active) {
      if (lastHintRef.current) {
        lastHintRef.current = null;
        setOverId(null);
        setDropPlacement(null);
      }
      return;
    }
    const rect = over.rect;
    const translated = event.active.rect.current.translated;
    const pointerY = translated
      ? translated.top + translated.height / 2
      : rect.top;
    const ratio = (pointerY - rect.top) / Math.max(rect.height, 1);
    const placement = placementFromRatio(Math.min(1, Math.max(0, ratio)));
    const nextOver = String(over.id);
    const prev = lastHintRef.current;
    if (prev && prev.overId === nextOver && prev.placement === placement) {
      return;
    }
    lastHintRef.current = { overId: nextOver, placement };
    setOverId(nextOver);
    setDropPlacement(placement);
  };

  const onDragStart = (event: DragStartEvent) => {
    setCtxMenu(null);
    setActiveId(String(event.active.id));
  };

  const onDragMove = (event: DragMoveEvent) => {
    updatePlacement(event);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const draggedId = String(event.active.id);
    const relativeToId = event.over ? String(event.over.id) : null;
    let placement: DropPlacement | null = null;
    if (event.over) {
      const rect = event.over.rect;
      const translated = event.active.rect.current.translated;
      const pointerY = translated
        ? translated.top + translated.height / 2
        : rect.top;
      const ratio = (pointerY - rect.top) / Math.max(rect.height, 1);
      placement = placementFromRatio(Math.min(1, Math.max(0, ratio)));
    }

    resetDrag();

    if (!relativeToId || !placement || draggedId === relativeToId) return;

    const target = resolveDropTarget(
      sourceTree,
      draggedId,
      relativeToId,
      placement,
    );
    if (!target) return;
    onMove(draggedId, target.parentId, target.index);
  };

  const openDeleteConfirm = (id: string) => {
    const node = findNodeById(sourceTree, id);
    if (!node) return;
    const descendantCount = Math.max(0, collectAllIds([node]).length - 1);
    setDeleteConfirm({
      id,
      title: node.title.trim() || t("editor.nodeUntitled"),
      descendantCount,
    });
  };

  const handleContextMenu = (id: string, clientX: number, clientY: number) => {
    const list = listRef.current;
    // 右键只开菜单，不切换选中/正文；操作目标用 ctxMenu.nodeId
    ctxScrollLockRef.current = list?.scrollTop ?? 0;
    list?.focus({ preventScroll: true });
    // 先不可见挂载，layout 里量真实高度后再显示
    setCtxMenu({
      nodeId: id,
      anchorX: clientX,
      anchorY: clientY,
      x: 0,
      y: 0,
      ready: false,
    });
  };

  const ctxNode = ctxMenu
    ? findNodeById(sourceTree, ctxMenu.nodeId)
    : null;
  const labelsNode = labelsEditId
    ? findNodeById(sourceTree, labelsEditId)
    : null;
  const ctxPriority = ctxNode?.priority ?? null;

  const beginRename = (id: string) => {
    const node = findNodeById(sourceTree, id);
    if (!node) return;
    renameClickRef.current = null;
    setCtxMenu(null);
    setPrioSub(null);
    onSelect(id);
    setRenameDraft(node.title);
    setRenamingId(id);
  };

  const commitRename = () => {
    if (!renamingId) return;
    const next = renameDraft.trim() || t("editor.nodeUntitled");
    const node = findNodeById(sourceTree, renamingId);
    if (node && next !== node.title) onRename(renamingId, next);
    setRenamingId(null);
    renameClickRef.current = null;
  };

  const cancelRename = () => {
    setRenamingId(null);
    renameClickRef.current = null;
  };

  /** 单击选中；同节点 500ms 内再点一次 → 重命名；超时自动作废第一次 */
  const handleRowClick = (id: string) => {
    if (renamingId) {
      if (renamingId !== id) commitRename();
      onSelect(id);
      listRef.current?.focus({ preventScroll: true });
      return;
    }
    const now = Date.now();
    const prev = renameClickRef.current;
    if (prev && prev.id === id && now - prev.at <= RENAME_DOUBLE_MS) {
      renameClickRef.current = null;
      beginRename(id);
      return;
    }
    renameClickRef.current = { id, at: now };
    onSelect(id);
    listRef.current?.focus({ preventScroll: true });
  };

  const handleTreeKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (deleteConfirm) return;
    // 重命名输入框自己处理按键
    if (renamingId) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (e.key === "F2") {
      if (!selectedId) return;
      e.preventDefault();
      beginRename(selectedId);
      return;
    }
    if (mod && key === "c") {
      if (!selectedId) return;
      e.preventDefault();
      onCopy(selectedId);
      return;
    }
    if (mod && key === "v") {
      if (!canPaste) return;
      e.preventDefault();
      onPaste(selectedId);
      return;
    }
    if (e.key === "Delete") {
      if (!selectedId) return;
      e.preventDefault();
      openDeleteConfirm(selectedId);
    }
  };

  const overlayLabel = activeId ? findNumberedLabel(nodes, activeId) : null;

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.toolBtn}
          onClick={() => onAddChild(selectedId)}
        >
          {t("tree.child")}
        </button>
        <button
          type="button"
          className={styles.toolBtn}
          onClick={() => {
            if (selectedId) onAddSibling(selectedId);
          }}
        >
          {t("tree.sibling")}
        </button>
        <button type="button" className={styles.toolBtn} onClick={onPromote}>
          {t("tree.promote")}
        </button>
        <button type="button" className={styles.toolBtn} onClick={onDemote}>
          {t("tree.demote")}
        </button>
        <button
          type="button"
          className={styles.toolBtn}
          onClick={() => {
            if (selectedId) openDeleteConfirm(selectedId);
          }}
        >
          {t("tree.delete")}
        </button>
      </div>
      <div className={styles.searchWrap}>
        <div
          className={styles.searchField}
          data-has-value={q ? "1" : undefined}
        >
          <input
            className={styles.search}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              goMatch(e.shiftKey ? -1 : 1);
            }}
            placeholder={t("tree.search")}
            aria-label={t("tree.searchAria")}
          />
          {q ? (
            <button
              type="button"
              className={styles.searchClear}
              tabIndex={-1}
              aria-label={t("tree.searchClear")}
              title={t("tree.searchClear")}
              onMouseDown={(e) => {
                // 避免抢焦点导致点不到就失焦
                e.preventDefault();
              }}
              onClick={() => onSearchChange("")}
            >
              ×
            </button>
          ) : null}
        </div>
        {q ? (
          <span className={styles.matchMeta} aria-live="polite">
            {matchIds.length
              ? t("tree.matchCount", {
                  current: String(
                    (((matchIndex % matchIds.length) + matchIds.length) %
                      matchIds.length) +
                      1,
                  ),
                  total: String(matchIds.length),
                })
              : t("tree.noMatch")}
          </span>
        ) : null}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={resetDrag}
      >
        <div
          ref={listRef}
          className={styles.list}
          role="tree"
          tabIndex={0}
          data-wg-focus="tree"
          data-dragging={activeId || undefined}
          onKeyDown={handleTreeKeyDown}
          onMouseDown={() => {
            // 点树区域时拿焦点，便于 Delete / Ctrl+C/V；勿滚动，否则右键会跳
            listRef.current?.focus({ preventScroll: true });
          }}
        >
          {nodes.length === 0 ? (
            <div className={styles.empty}>{t("tree.noMatch")}</div>
          ) : (
            nodes.map((node) => (
              <TreeNodeRow
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedId}
                collapsedIds={collapsedIds}
                dragEnabled={!renamingId}
                matchQuery={q}
                matchIds={matchSet}
                currentMatchId={currentMatchId}
                enteringIds={enteringIds}
                overId={overId}
                dropPlacement={dropPlacement}
                renamingId={renamingId}
                renameDraft={renameDraft}
                onRenameDraftChange={setRenameDraft}
                onCommitRename={commitRename}
                onCancelRename={cancelRename}
                onSelect={handleRowClick}
                onToggle={onToggle}
                onContextMenu={handleContextMenu}
              />
            ))
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {overlayLabel ? (
            <div className={styles.dragGhost}>{overlayLabel}</div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {ctxMenu
        ? createPortal(
            <div
              ref={ctxMenuRef}
              className={styles.ctxMenu}
              style={{
                left: ctxMenu.x,
                top: ctxMenu.y,
                visibility: ctxMenu.ready ? "visible" : "hidden",
                pointerEvents: ctxMenu.ready ? "auto" : "none",
                ...(ctxMenu.maxHeight != null
                  ? {
                      maxHeight: ctxMenu.maxHeight,
                      overflowY: "auto" as const,
                    }
                  : null),
              }}
              role="menu"
            >
              <button
                type="button"
                className={styles.ctxItem}
                role="menuitem"
                onMouseEnter={schedulePriorityClose}
                onClick={() => {
                  onAddChild(ctxMenu.nodeId);
                  setCtxMenu(null);
                }}
              >
                {t("tree.menuAddChild")}
              </button>
              <button
                type="button"
                className={styles.ctxItem}
                role="menuitem"
                onMouseEnter={schedulePriorityClose}
                onClick={() => {
                  onAddSibling(ctxMenu.nodeId);
                  setCtxMenu(null);
                }}
              >
                {t("tree.menuAddSibling")}
              </button>
              <button
                type="button"
                className={styles.ctxItem}
                role="menuitem"
                onMouseEnter={schedulePriorityClose}
                onClick={() => beginRename(ctxMenu.nodeId)}
              >
                {t("tree.menuRename")}
              </button>
              <button
                type="button"
                className={styles.ctxItem}
                role="menuitem"
                onMouseEnter={schedulePriorityClose}
                onClick={() => {
                  onCopy(ctxMenu.nodeId);
                  setCtxMenu(null);
                }}
              >
                {t("tree.menuCopy")}
              </button>
              <button
                type="button"
                className={styles.ctxItem}
                role="menuitem"
                disabled={!canPaste}
                onMouseEnter={schedulePriorityClose}
                onClick={() => {
                  if (!canPaste) return;
                  onPaste(ctxMenu.nodeId);
                  setCtxMenu(null);
                }}
              >
                {t("tree.menuPaste")}
              </button>
              <div className={styles.ctxSep} role="separator" />
              <button
                ref={prioItemRef}
                type="button"
                className={styles.ctxItem}
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={Boolean(prioSub)}
                onMouseEnter={openPrioritySub}
                onMouseLeave={schedulePriorityClose}
                onFocus={openPrioritySub}
                onClick={() => {
                  if (prioSub) closePrioritySub();
                  else openPrioritySub();
                }}
              >
                <span className={styles.ctxItemRow}>
                  <span className={styles.ctxItemLabel}>
                    {ctxPriority ? (
                      <PriorityIcon
                        priority={ctxPriority}
                        className={styles.ctxPrio}
                      />
                    ) : null}
                    {t("tree.menuPriority")}
                  </span>
                  <span className={styles.ctxChevron} aria-hidden>
                    ▸
                  </span>
                </span>
              </button>
              <button
                type="button"
                className={styles.ctxItem}
                role="menuitem"
                onMouseEnter={schedulePriorityClose}
                onClick={() => {
                  setLabelsEditId(ctxMenu.nodeId);
                  setCtxMenu(null);
                }}
              >
                {t("tree.menuLabels")}
              </button>
              {onReferenceGlossary || onCopyGlossary ? (
                <>
                  <div className={styles.ctxSep} role="separator" />
                  {onReferenceGlossary ? (
                    <button
                      type="button"
                      className={styles.ctxItem}
                      role="menuitem"
                      onMouseEnter={schedulePriorityClose}
                      onClick={() => {
                        onReferenceGlossary(ctxMenu.nodeId);
                        setCtxMenu(null);
                      }}
                    >
                      {t("tree.menuRefGlossary")}
                    </button>
                  ) : null}
                  {onCopyGlossary ? (
                    <button
                      type="button"
                      className={styles.ctxItem}
                      role="menuitem"
                      onMouseEnter={schedulePriorityClose}
                      onClick={() => {
                        onCopyGlossary(ctxMenu.nodeId);
                        setCtxMenu(null);
                      }}
                    >
                      {t("tree.menuCopyGlossary")}
                    </button>
                  ) : null}
                </>
              ) : null}
              {(() => {
                const ctxNode = findNodeById(sourceTree, ctxMenu.nodeId);
                const childCount = ctxNode?.children.length ?? 0;
                if (childCount <= 0) return null;
                return (
                  <>
                    <div className={styles.ctxSep} role="separator" />
                    <button
                      type="button"
                      className={styles.ctxItem}
                      role="menuitem"
                      title={t("tree.releaseChildrenHint")}
                      onMouseEnter={schedulePriorityClose}
                      onClick={() => {
                        onReleaseChildren(ctxMenu.nodeId);
                        setCtxMenu(null);
                      }}
                    >
                      {t("tree.menuReleaseChildren")}
                    </button>
                    <button
                      type="button"
                      className={styles.ctxItem}
                      role="menuitem"
                      title={t("tree.dissolveHint")}
                      onMouseEnter={schedulePriorityClose}
                      onClick={() => {
                        const n = findNodeById(sourceTree, ctxMenu.nodeId);
                        if (!n || n.children.length === 0) {
                          setCtxMenu(null);
                          return;
                        }
                        setDissolveConfirm({
                          id: n.id,
                          title: n.title,
                          descendantCount: n.children.length,
                        });
                        setCtxMenu(null);
                      }}
                    >
                      {t("tree.menuDissolve")}
                    </button>
                  </>
                );
              })()}
              <div className={styles.ctxSep} role="separator" />
              <button
                type="button"
                className={`${styles.ctxItem} ${styles.ctxItemDanger}`}
                role="menuitem"
                onMouseEnter={schedulePriorityClose}
                onClick={() => {
                  openDeleteConfirm(ctxMenu.nodeId);
                  setCtxMenu(null);
                }}
              >
                {t("tree.menuDelete")}
              </button>
            </div>,
            document.body,
          )
        : null}

      {ctxMenu && prioSub
        ? createPortal(
            <div
              ref={prioSubRef}
              className={styles.ctxMenu}
              style={{
                left: prioSub.x,
                top: prioSub.y,
                visibility: prioSub.ready ? "visible" : "hidden",
                pointerEvents: prioSub.ready ? "auto" : "none",
                zIndex: 91,
              }}
              role="menu"
              onMouseEnter={openPrioritySub}
              onMouseLeave={schedulePriorityClose}
            >
              {(
                [
                  [null, "tree.priorityNone"],
                  ["high", "tree.priorityHigh"],
                  ["medium", "tree.priorityMedium"],
                  ["low", "tree.priorityLow"],
                ] as const
              ).map(([value, key]) => (
                <button
                  key={key}
                  type="button"
                  className={styles.ctxItem}
                  role="menuitemradio"
                  aria-checked={ctxPriority === value}
                  onClick={() => {
                    onSetPriority(ctxMenu.nodeId, value);
                    setCtxMenu(null);
                  }}
                >
                  <span className={styles.ctxCheck}>
                    {ctxPriority === value ? "✓" : ""}
                  </span>
                  {value ? (
                    <PriorityIcon priority={value} className={styles.ctxPrio} />
                  ) : (
                    <span className={styles.ctxPrioSpacer} />
                  )}
                  {t(key)}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}

      {labelsNode && labelsEditId ? (
        <NodeLabelsDialog
          title={labelsNode.title}
          labels={labelsNode.labels ?? []}
          onCancel={() => setLabelsEditId(null)}
          onSave={(labels) => {
            onSetLabels(labelsEditId, labels);
            setLabelsEditId(null);
          }}
        />
      ) : null}

      {deleteConfirm ? (
        <div
          className={styles.confirmBackdrop}
          role="presentation"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className={styles.confirmPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wg-tree-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="wg-tree-delete-title" className={styles.confirmTitle}>
              {t("tree.deleteConfirmTitle")}
            </h2>
            <p className={styles.confirmBody}>
              {isReferencedAsGlossary?.(deleteConfirm.id)
                ? deleteConfirm.descendantCount > 0
                  ? t("tree.deleteReferencedBodyWithChildren", {
                      title: deleteConfirm.title,
                      count: String(deleteConfirm.descendantCount),
                    })
                  : t("tree.deleteReferencedBody", {
                      title: deleteConfirm.title,
                    })
                : deleteConfirm.descendantCount > 0
                  ? t("tree.deleteConfirmBodyWithChildren", {
                      title: deleteConfirm.title,
                      count: String(deleteConfirm.descendantCount),
                    })
                  : t("tree.deleteConfirmBody", {
                      title: deleteConfirm.title,
                    })}
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmGhost}
                onClick={() => setDeleteConfirm(null)}
              >
                {t("tree.deleteConfirmCancel")}
              </button>
              <button
                type="button"
                className={styles.confirmDanger}
                onClick={() => {
                  onDelete(deleteConfirm.id);
                  setDeleteConfirm(null);
                }}
              >
                {t("tree.deleteConfirmOk")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dissolveConfirm ? (
        <div
          className={styles.confirmBackdrop}
          role="presentation"
          onClick={() => setDissolveConfirm(null)}
        >
          <div
            className={styles.confirmPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wg-tree-dissolve-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="wg-tree-dissolve-title" className={styles.confirmTitle}>
              {t("tree.dissolveConfirmTitle")}
            </h2>
            <p className={styles.confirmBody}>
              {t("tree.dissolveConfirmBody", {
                title: dissolveConfirm.title,
                count: String(dissolveConfirm.descendantCount),
              })}
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmGhost}
                onClick={() => setDissolveConfirm(null)}
              >
                {t("tree.deleteConfirmCancel")}
              </button>
              <button
                type="button"
                className={styles.confirmDanger}
                onClick={() => {
                  onDissolve(dissolveConfirm.id);
                  setDissolveConfirm(null);
                }}
              >
                {t("tree.dissolveConfirmOk")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function scrollToNode(
  list: HTMLDivElement | null,
  id: string,
  behavior: ScrollBehavior = "smooth",
) {
  if (!list) return;
  const el = list.querySelector(`[data-node-id="${CSS.escape(id)}"]`);
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ block: "nearest", behavior });
  }
}
