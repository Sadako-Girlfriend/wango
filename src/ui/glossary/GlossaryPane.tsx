/**
 * 词表库面板：展示词表树、新建/拖拽/删除/打开审计日志。
 *
 * 数据变更一律经 props 回调交给 sessionStore；本组件不直接改 ProjectData。
 * 拖拽落点只产出 (id, parentId, index)，算法与大纲 move 在 domain 侧各自实现。
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  findGlossaryById,
  findGlossaryLocation,
  resolveGlossaryTitle,
  type GlossaryNode,
  type TreeNode,
} from "@/domain";
import { useI18n } from "@/i18n/useI18n";
import { ThemeColorPalette } from "@/ui/color/ThemeColorPalette";
import { placeFixedMenu } from "@/ui/tree/placeFixedMenu";
import { GlossaryAliasesDialog } from "./GlossaryAliasesDialog";
import styles from "./GlossaryPane.module.css";

/** 与大纲树一致：同节点 500ms 内再点一次进入重命名 */
const RENAME_DOUBLE_MS = 500;

interface GlossaryPaneProps {
  glossary: GlossaryNode[];
  tree: TreeNode[];
  selectedId: string | null;
  collapsedIds: Record<string, true>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onAddRoot: () => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, parentId: string | null, index: number) => void;
  /** 保存词条别名整表 */
  onSaveAliases: (id: string, aliases: string[]) => void;
  /** 双击 / 菜单改名 */
  onRename: (id: string, title: string) => void;
  /** 自定义引用色；null 恢复主题色 */
  onSetColor: (id: string, color: string | null) => void;
  /** 解析后的颜色（含父级继承），用于色点展示 */
  resolvedColors?: Record<string, string>;
  /** 打开引用审查 */
  onOpenLogs: (entryId: string) => void;
}

interface CtxMenu {
  nodeId: string;
  x: number;
  y: number;
  ready: boolean;
}

export function GlossaryPane({
  glossary,
  tree,
  selectedId,
  collapsedIds,
  onSelect,
  onToggle,
  onAddRoot,
  onAddChild,
  onDelete,
  onMove,
  onSaveAliases,
  onRename,
  onSetColor,
  resolvedColors = {},
  onOpenLogs,
}: GlossaryPaneProps) {
  const { t } = useI18n();
  const [ctx, setCtx] = useState<CtxMenu | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [colorPos, setColorPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [aliasesEditId, setAliasesEditId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameClickRef = useRef<{ id: string; at: number } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const deleteNode = deleteId ? findGlossaryById(glossary, deleteId) : null;
  const aliasesNode = aliasesEditId
    ? findGlossaryById(glossary, aliasesEditId)
    : null;
  const ctxNode = ctx ? findGlossaryById(glossary, ctx.nodeId) : null;

  const handleDragEnd = (e: DragEndEvent) => {
    const draggedId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || draggedId === overId) return;
    const overLoc = findGlossaryLocation(glossary, overId);
    if (!overLoc) return;
    const parentId = overLoc.parent ? overLoc.parent.id : null;
    onMove(draggedId, parentId, overLoc.index);
  };

  const openCtx = (id: string, clientX: number, clientY: number) => {
    setColorOpen(false);
    setColorPos(null);
    setCtx({ nodeId: id, x: clientX, y: clientY, ready: false });
    requestAnimationFrame(() => {
      const el = document.getElementById("wg-glossary-ctx");
      if (!el) return;
      const placed = placeFixedMenu({
        anchorX: clientX,
        anchorY: clientY,
        menuWidth: el.offsetWidth,
        menuHeight: el.offsetHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      setCtx({
        nodeId: id,
        x: placed.x,
        y: placed.y,
        ready: true,
      });
    });
  };

  /** 色板飞出到右键菜单旁（与字体颜色同款大板） */
  const openColorFlyout = () => {
    setColorOpen((v) => {
      if (v) setColorPos(null);
      return !v;
    });
  };

  useEffect(() => {
    if (!colorOpen || !ctx) {
      setColorPos(null);
      return;
    }
    const id = requestAnimationFrame(() => {
      const menu = document.getElementById("wg-glossary-ctx");
      const panel = document.getElementById("wg-glossary-color");
      if (!menu || !panel) return;
      const gap = 6;
      const mw = menu.offsetWidth;
      const pw = panel.offsetWidth;
      const ph = panel.offsetHeight;
      let x = ctx.x + mw + gap;
      if (x + pw > window.innerWidth - 8) x = ctx.x - pw - gap;
      if (x < 8) x = 8;
      let y = ctx.y;
      if (y + ph > window.innerHeight - 8) {
        y = Math.max(8, window.innerHeight - ph - 8);
      }
      setColorPos({ x, y });
    });
    return () => cancelAnimationFrame(id);
  }, [colorOpen, ctx]);

  const beginRename = (id: string) => {
    const node = findGlossaryById(glossary, id);
    if (!node) return;
    setCtx(null);
    onSelect(id);
    setRenameDraft(resolveGlossaryTitle(node, tree));
    setRenamingId(id);
  };

  const commitRename = () => {
    if (!renamingId) return;
    const next = renameDraft.trim() || t("glossary.untitled");
    const node = findGlossaryById(glossary, renamingId);
    const prev = node ? resolveGlossaryTitle(node, tree) : "";
    if (node && next !== prev) onRename(renamingId, next);
    setRenamingId(null);
    renameClickRef.current = null;
  };

  const cancelRename = () => {
    setRenamingId(null);
    renameClickRef.current = null;
  };

  const handleRowClick = (id: string) => {
    if (renamingId) {
      if (renamingId !== id) commitRename();
      onSelect(id);
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
  };

  return (
    <div className={styles.root} data-wg-focus="glossary" tabIndex={-1}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t("glossary.title")}</h2>
        <button
          type="button"
          className={styles.addBtn}
          title={t("glossary.add")}
          aria-label={t("glossary.add")}
          onClick={onAddRoot}
        >
          +
        </button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className={styles.list}>
          {glossary.map((n) => (
            <GlossaryRow
              key={n.id}
              node={n}
              depth={0}
              tree={tree}
              selectedId={selectedId}
              collapsedIds={collapsedIds}
              renamingId={renamingId}
              renameDraft={renameDraft}
              resolvedColors={resolvedColors}
              onRenameDraftChange={setRenameDraft}
              onCommitRename={commitRename}
              onCancelRename={cancelRename}
              onSelect={handleRowClick}
              onToggle={onToggle}
              onContextMenu={openCtx}
            />
          ))}
        </div>
      </DndContext>

      {ctx
        ? createPortal(
            <div
              id="wg-glossary-ctx"
              className={styles.ctxMenu}
              style={{
                left: ctx.x,
                top: ctx.y,
                visibility: ctx.ready ? "visible" : "hidden",
              }}
              role="menu"
            >
              <button
                type="button"
                className={styles.ctxItem}
                role="menuitem"
                onClick={() => {
                  beginRename(ctx.nodeId);
                }}
              >
                {t("glossary.menuRename")}
              </button>
              <button
                type="button"
                className={styles.ctxItem}
                role="menuitem"
                onClick={() => {
                  onAddChild(ctx.nodeId);
                  setCtx(null);
                }}
              >
                {t("glossary.menuAddChild")}
              </button>
              <button
                type="button"
                className={styles.ctxItem}
                role="menuitem"
                aria-expanded={colorOpen}
                onClick={openColorFlyout}
              >
                {t("glossary.menuColor")} ▸
              </button>
              <button
                type="button"
                className={styles.ctxItem}
                role="menuitem"
                onClick={() => {
                  setAliasesEditId(ctx.nodeId);
                  setCtx(null);
                }}
              >
                {t("glossary.menuAliases")}
              </button>
              <button
                type="button"
                className={styles.ctxItem}
                role="menuitem"
                onClick={() => {
                  onOpenLogs(ctx.nodeId);
                  setCtx(null);
                }}
              >
                {t("glossary.menuRefLogs")}
              </button>
              <div className={styles.ctxSep} />
              <button
                type="button"
                className={`${styles.ctxItem} ${styles.ctxItemDanger}`}
                role="menuitem"
                onClick={() => {
                  setDeleteId(ctx.nodeId);
                  setCtx(null);
                }}
              >
                {t("glossary.menuDelete")}
              </button>
            </div>,
            document.body,
          )
        : null}

      {ctx && colorOpen
        ? createPortal(
            <div
              id="wg-glossary-color"
              className={styles.colorFlyout}
              style={{
                left: colorPos?.x ?? ctx.x + 170,
                top: colorPos?.y ?? ctx.y,
                visibility: colorPos ? "visible" : "hidden",
              }}
            >
              <ThemeColorPalette
                activeColor={
                  ctxNode?.color ?? resolvedColors[ctx.nodeId]
                }
                clearLabel={t("glossary.menuColorDefault")}
                onPick={(c) => {
                  onSetColor(ctx.nodeId, c);
                  setCtx(null);
                  setColorOpen(false);
                  setColorPos(null);
                }}
                onClear={() => {
                  onSetColor(ctx.nodeId, null);
                  setCtx(null);
                  setColorOpen(false);
                  setColorPos(null);
                }}
              />
            </div>,
            document.body,
          )
        : null}

      {ctx
        ? createPortal(
            <div
              style={{ position: "fixed", inset: 0, zIndex: 89 }}
              onClick={() => {
                setCtx(null);
                setColorOpen(false);
                setColorPos(null);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setCtx(null);
                setColorOpen(false);
                setColorPos(null);
              }}
            />,
            document.body,
          )
        : null}

      {deleteNode && deleteId
        ? createPortal(
            <div
              className={styles.confirmBackdrop}
              role="presentation"
              onClick={() => setDeleteId(null)}
            >
              <div
                className={styles.confirmPanel}
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className={styles.confirmTitle}>
                  {t("glossary.deleteConfirmTitle")}
                </h2>
                <p className={styles.confirmBody}>
                  {t("glossary.deleteConfirmBody", {
                    title: resolveGlossaryTitle(deleteNode, tree),
                  })}
                </p>
                <div className={styles.confirmActions}>
                  <button
                    type="button"
                    className={styles.confirmGhost}
                    onClick={() => setDeleteId(null)}
                  >
                    {t("tree.deleteConfirmCancel")}
                  </button>
                  <button
                    type="button"
                    className={styles.confirmDanger}
                    onClick={() => {
                      onDelete(deleteId);
                      setDeleteId(null);
                    }}
                  >
                    {t("tree.deleteConfirmOk")}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {aliasesNode && aliasesEditId ? (
        <GlossaryAliasesDialog
          termTitle={resolveGlossaryTitle(aliasesNode, tree)}
          aliases={aliasesNode.aliases}
          onCancel={() => setAliasesEditId(null)}
          onSave={(list) => {
            onSaveAliases(aliasesEditId, list);
            setAliasesEditId(null);
          }}
        />
      ) : null}
    </div>
  );
}

function GlossaryRow({
  node,
  depth,
  tree,
  selectedId,
  collapsedIds,
  renamingId,
  renameDraft,
  resolvedColors,
  onRenameDraftChange,
  onCommitRename,
  onCancelRename,
  onSelect,
  onToggle,
  onContextMenu,
}: {
  node: GlossaryNode;
  depth: number;
  tree: TreeNode[];
  selectedId: string | null;
  collapsedIds: Record<string, true>;
  renamingId: string | null;
  renameDraft: string;
  resolvedColors: Record<string, string>;
  onRenameDraftChange: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
}) {
  const { t } = useI18n();
  const hasChildren = node.children.length > 0;
  const collapsed = Boolean(collapsedIds[node.id]);
  const renaming = renamingId === node.id;
  const renameInputRef = useRef<HTMLInputElement>(null);
  const suppressClickRef = useRef(false);
  const kindLabel =
    node.kind === "ref"
      ? t("glossary.kindRef")
      : node.kind === "copy"
        ? t("glossary.kindCopy")
        : t("glossary.kindLocal");

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } =
    useDraggable({ id: node.id, disabled: renaming });
  const { setNodeRef: setDropRef } = useDroppable({
    id: node.id,
    disabled: renaming,
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
          opacity: isDragging ? 0.4 : 1,
        }}
        data-selected={selectedId === node.id || undefined}
        data-node-id={node.id}
        data-renaming={renaming || undefined}
        onClick={() => {
          if (renaming) return;
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          onSelect(node.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (renaming) return;
          onContextMenu(node.id, e.clientX, e.clientY);
        }}
        {...(renaming ? {} : { ...listeners, ...attributes })}
      >
        {hasChildren ? (
          <button
            type="button"
            className={styles.twist}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {collapsed ? "▸" : "▾"}
          </button>
        ) : (
          <span className={styles.twistSpacer} />
        )}
        <span className={styles.badge}>{kindLabel}</span>
        {resolvedColors[node.id] ? (
          <span
            className={styles.colorDot}
            style={{ background: resolvedColors[node.id] }}
            aria-hidden
          />
        ) : null}
        {renaming ? (
          <input
            ref={renameInputRef}
            className={styles.renameInput}
            value={renameDraft}
            aria-label={t("glossary.menuRename")}
            title={t("glossary.renameHint")}
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
          <span className={styles.label} title={t("glossary.renameHint")}>
            {resolveGlossaryTitle(node, tree)}
          </span>
        )}
      </div>
      {hasChildren && !collapsed
        ? node.children.map((c) => (
            <GlossaryRow
              key={c.id}
              node={c}
              depth={depth + 1}
              tree={tree}
              selectedId={selectedId}
              collapsedIds={collapsedIds}
              renamingId={renamingId}
              renameDraft={renameDraft}
              resolvedColors={resolvedColors}
              onRenameDraftChange={onRenameDraftChange}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onSelect={onSelect}
              onToggle={onToggle}
              onContextMenu={onContextMenu}
            />
          ))
        : null}
    </>
  );
}
