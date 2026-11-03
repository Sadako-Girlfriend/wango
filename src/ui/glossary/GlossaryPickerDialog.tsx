/**
 * 词表选择：一级根词条 + 二级子节点（二级带摘要）；可搜标题/正文；支持多选。
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  findGlossaryById,
  plainBodyPreview,
  resolveGlossaryContent,
  resolveGlossaryTitle,
  type GlossaryNode,
  type TreeNode,
} from "@/domain";
import { useI18n } from "@/i18n/useI18n";
import styles from "./GlossaryDialogs.module.css";
import pickerStyles from "./GlossaryPickerDialog.module.css";

type Mode = "single" | "multi";

interface GlossaryPickerDialogProps {
  glossary: GlossaryNode[];
  tree: TreeNode[];
  mode: Mode;
  title: string;
  confirmLabel: string;
  initialSelectedIds?: string[];
  allowRoot?: boolean;
  onCancel: () => void;
  onConfirm: (ids: string[]) => void;
}

type Row = {
  id: string;
  label: string;
  summary: string;
  /** 标题 + 正文，供搜索 */
  haystack: string;
  hasChildren: boolean;
};

function toRow(n: GlossaryNode, tree: TreeNode[]): Row {
  const content = resolveGlossaryContent(n, tree);
  const label = resolveGlossaryTitle(n, tree);
  const plain = plainBodyPreview(content, 400);
  return {
    id: n.id,
    label,
    summary: plainBodyPreview(content, 72),
    haystack: `${label}\n${plain}`.toLowerCase(),
    hasChildren: n.children.length > 0,
  };
}

function matchesQuery(haystack: string, q: string): boolean {
  if (!q) return true;
  return haystack.includes(q);
}

export function GlossaryPickerDialog({
  glossary,
  tree,
  mode,
  title,
  confirmLabel,
  initialSelectedIds = [],
  allowRoot = false,
  onCancel,
  onConfirm,
}: GlossaryPickerDialogProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const rootRows = useMemo(
    () => glossary.map((n) => toRow(n, tree)),
    [glossary, tree],
  );

  const childMap = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const n of glossary) {
      m.set(
        n.id,
        n.children.map((c) => toRow(c, tree)),
      );
    }
    return m;
  }, [glossary, tree]);

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelectedIds),
  );
  const [singleId, setSingleId] = useState<string | null>(
    initialSelectedIds[0] ?? (allowRoot ? "" : null),
  );
  const [openParentId, setOpenParentId] = useState<string | null>(
    () => glossary[0]?.id ?? null,
  );

  const filteredRoots = useMemo(() => {
    if (!q) return rootRows;
    return rootRows.filter((row) => {
      if (matchesQuery(row.haystack, q)) return true;
      const kids = childMap.get(row.id) ?? [];
      return kids.some((c) => matchesQuery(c.haystack, q));
    });
  }, [rootRows, childMap, q]);

  // 搜索命中子节点时，自动展开第一个仍有匹配子项的父级
  useEffect(() => {
    if (!q) return;
    if (
      openParentId &&
      filteredRoots.some((r) => r.id === openParentId)
    ) {
      const kids = childMap.get(openParentId) ?? [];
      const kidHit = kids.some((c) => matchesQuery(c.haystack, q));
      const parentHit = matchesQuery(
        rootRows.find((r) => r.id === openParentId)?.haystack ?? "",
        q,
      );
      if (kidHit || parentHit) return;
    }
    const next =
      filteredRoots.find((r) => {
        const kids = childMap.get(r.id) ?? [];
        return kids.some((c) => matchesQuery(c.haystack, q));
      }) ?? filteredRoots[0];
    if (next) setOpenParentId(next.id);
  }, [q, filteredRoots, childMap, openParentId, rootRows]);

  const children = useMemo(() => {
    if (!openParentId) return [] as Row[];
    const kids = childMap.get(openParentId) ?? [];
    if (!q) return kids;
    const parentHit = matchesQuery(
      rootRows.find((r) => r.id === openParentId)?.haystack ?? "",
      q,
    );
    // 父级本身命中时仍展示全部子节点；否则只留命中子项
    if (parentHit) return kids;
    return kids.filter((c) => matchesQuery(c.haystack, q));
  }, [openParentId, childMap, q, rootRows]);

  const openParentLabel = openParentId
    ? resolveGlossaryTitle(
        findGlossaryById(glossary, openParentId) ??
          ({ title: "" } as GlossaryNode),
        tree,
      )
    : "";

  const canConfirm =
    mode === "multi" ? selected.size > 0 : singleId !== null;

  const selectedLabels = useMemo(() => {
    if (mode !== "multi" || selected.size === 0) return "";
    return [...selected]
      .map((id) => {
        const n = findGlossaryById(glossary, id);
        return n ? resolveGlossaryTitle(n, tree) : id;
      })
      .join(t("glossary.linkTooltipSep"));
  }, [mode, selected, glossary, tree, t]);

  const toggleMulti = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pickSingle = (id: string) => setSingleId(id);

  const renderRow = (
    row: Row,
    opts: { showChevron?: boolean; showSummary?: boolean },
  ) => {
    const checked =
      mode === "multi" ? selected.has(row.id) : singleId === row.id;
    const isOpen = openParentId === row.id;
    /** 一级：点行只展开；再点已展开项才勾选。点方框直接勾选。二级：点行即勾选。 */
    const isLevel1 = Boolean(opts.showChevron);

    const toggleCheck = () => {
      if (mode === "multi") toggleMulti(row.id);
      else pickSingle(row.id);
    };

    return (
      <div
        key={row.id}
        className={
          opts.showSummary ? pickerStyles.row : pickerStyles.rowCompact
        }
        data-active={checked || undefined}
        data-open={isLevel1 && isOpen ? true : undefined}
        role="option"
        aria-selected={checked}
        onClick={() => {
          if (isLevel1) {
            const wasOpen = openParentId === row.id;
            setOpenParentId(row.id);
            if (wasOpen) toggleCheck();
            else if (mode === "single") pickSingle(row.id);
            return;
          }
          toggleCheck();
        }}
      >
        <button
          type="button"
          className={pickerStyles.markBtn}
          aria-label={checked ? "uncheck" : "check"}
          aria-pressed={checked}
          onClick={(e) => {
            e.stopPropagation();
            if (isLevel1) setOpenParentId(row.id);
            toggleCheck();
          }}
        >
          {mode === "multi" ? (checked ? "☑" : "☐") : checked ? "●" : "○"}
        </button>
        <span className={pickerStyles.rowMain}>
          <span className={pickerStyles.label}>{row.label}</span>
          {opts.showSummary ? (
            row.summary ? (
              <span className={pickerStyles.summary}>{row.summary}</span>
            ) : (
              <span className={pickerStyles.summary}>
                {t("glossary.pickerNoSummary")}
              </span>
            )
          ) : null}
        </span>
        {isLevel1 && row.hasChildren ? (
          <span className={pickerStyles.chevron} aria-hidden>
            ▸
          </span>
        ) : null}
      </div>
    );
  };

  return createPortal(
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={onCancel}
    >
      <div
        className={`${styles.panel} ${pickerStyles.panel}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.body}>
          {mode === "multi"
            ? t("glossary.pickerMultiHint")
            : t("glossary.pickerSingleHint")}
        </p>

        <div className={pickerStyles.searchWrap}>
          <input
            type="search"
            className={pickerStyles.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("glossary.pickerSearchPlaceholder")}
            aria-label={t("glossary.pickerSearchPlaceholder")}
            autoFocus
          />
        </div>

        {mode === "multi" ? (
          <div className={pickerStyles.selectedBar}>
            {selectedLabels
              ? t("glossary.pickerSelected", { titles: selectedLabels })
              : "\u00a0"}
          </div>
        ) : null}

        <div className={pickerStyles.cascade}>
          <div className={pickerStyles.col}>
            <div className={pickerStyles.colHead}>
              {t("glossary.pickerLevel1")}
            </div>
            <div className={pickerStyles.list} role="listbox">
              {allowRoot && mode === "single" && !q ? (
                <button
                  type="button"
                  className={pickerStyles.rowCompact}
                  data-active={singleId === "" || undefined}
                  role="option"
                  aria-selected={singleId === ""}
                  onClick={() => pickSingle("")}
                >
                  <span className={pickerStyles.mark}>
                    {singleId === "" ? "●" : "○"}
                  </span>
                  <span className={pickerStyles.rowMain}>
                    <span className={pickerStyles.label}>
                      {t("glossary.pickerRoot")}
                    </span>
                  </span>
                </button>
              ) : null}
              {filteredRoots.length === 0 ? (
                <p className={pickerStyles.empty}>
                  {q
                    ? t("glossary.pickerSearchEmpty")
                    : t("glossary.pickerEmpty")}
                </p>
              ) : (
                filteredRoots.map((row) =>
                  renderRow(row, { showChevron: true, showSummary: false }),
                )
              )}
            </div>
          </div>

          <div className={pickerStyles.col}>
            <div className={pickerStyles.colHead}>
              {openParentId
                ? t("glossary.pickerLevel2", { title: openParentLabel })
                : t("glossary.pickerLevel2Empty")}
            </div>
            <div className={pickerStyles.list} role="listbox">
              {!openParentId ? (
                <p className={pickerStyles.empty}>
                  {t("glossary.pickerPickParent")}
                </p>
              ) : children.length === 0 ? (
                <p className={pickerStyles.empty}>
                  {q
                    ? t("glossary.pickerSearchEmpty")
                    : t("glossary.pickerNoChildren")}
                </p>
              ) : (
                children.map((row) =>
                  renderRow(row, { showChevron: false, showSummary: true }),
                )
              )}
            </div>
          </div>
        </div>

        <div className={`${styles.actions} ${pickerStyles.footer}`}>
          <button type="button" className={styles.ghost} onClick={onCancel}>
            {t("glossary.blacklistCancel")}
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={!canConfirm}
            onClick={() => {
              if (mode === "multi") onConfirm([...selected]);
              else if (singleId !== null) {
                onConfirm(singleId === "" ? [] : [singleId]);
              }
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
