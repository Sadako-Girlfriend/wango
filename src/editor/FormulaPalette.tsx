/**
 * 可拖符号面板 + 公式库（搜索 / 分类 / 一键插入）。
 * 「公式库」与常用/希腊等同级页签，排在最后。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import type { MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/useI18n";
import {
  filterFormulaCatalog,
  loadFormulaCatalog,
  type FormulaLibCatFilter,
  type FormulaLibGradeFilter,
} from "./formulaLibrary/loadCatalog";
import {
  FORMULA_LIB_CATS,
  FORMULA_LIB_GRADES,
  type FormulaLibItem,
} from "./formulaLibrary/types";
import {
  FORMULA_CATEGORIES,
  type FormulaCategoryId,
  type FormulaSymbol,
} from "./formulaSymbols";
import { insertIntoActiveMath } from "./mathFocus";
import styles from "./FormulaPalette.module.css";

type Pos = { x: number; y: number };
/** 顶栏页签：公式库 或 符号分类 */
type MainTab = "library" | FormulaCategoryId;

export type FormulaPaletteProps = {
  open: boolean;
  onClose: () => void;
  onInsertFallback?: (latex: string) => void;
};

const DEFAULT_POS: Pos = { x: 72, y: 120 };

export function FormulaPalette({
  open,
  onClose,
  onInsertFallback,
}: FormulaPaletteProps) {
  const { t } = useI18n();
  const [mainTab, setMainTab] = useState<MainTab>("structure");
  const [libCat, setLibCat] = useState<FormulaLibCatFilter>("all");
  const [libGrade, setLibGrade] = useState<FormulaLibGradeFilter>("all");
  const [libQuery, setLibQuery] = useState("");
  const [libItems, setLibItems] = useState<FormulaLibItem[] | null>(null);
  const [libError, setLibError] = useState(false);
  const [pos, setPos] = useState<Pos>(DEFAULT_POS);
  const dragRef = useRef<{
    ox: number;
    oy: number;
    sx: number;
    sy: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || mainTab !== "library" || libItems) return;
    let cancelled = false;
    setLibError(false);
    void loadFormulaCatalog()
      .then((list) => {
        if (!cancelled) setLibItems(list);
      })
      .catch(() => {
        if (!cancelled) setLibError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mainTab, libItems]);

  const filteredLib = useMemo(() => {
    if (!libItems) return [];
    return filterFormulaCatalog(libItems, {
      cat: libCat,
      grade: libGrade,
      query: libQuery,
    });
  }, [libItems, libCat, libGrade, libQuery]);

  const onPointerDownHead = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "BUTTON") return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      dragRef.current = {
        ox: e.clientX,
        oy: e.clientY,
        sx: pos.x,
        sy: pos.y,
      };
    },
    [pos],
  );

  const onPointerMoveHead = useCallback((e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const nx = d.sx + (e.clientX - d.ox);
    const ny = d.sy + (e.clientY - d.oy);
    const maxX = window.innerWidth - 80;
    const maxY = window.innerHeight - 40;
    setPos({
      x: Math.max(8, Math.min(maxX, nx)),
      y: Math.max(8, Math.min(maxY, ny)),
    });
  }, []);

  const onPointerUpHead = useCallback(() => {
    dragRef.current = null;
  }, []);

  const insertLatex = useCallback(
    (latex: string) => {
      if (insertIntoActiveMath(latex)) return;
      onInsertFallback?.(latex);
    },
    [onInsertFallback],
  );

  const insertSym = useCallback(
    (sym: FormulaSymbol) => insertLatex(sym.latex),
    [insertLatex],
  );

  if (!open) return null;

  const symbolCat =
    mainTab === "library"
      ? null
      : (FORMULA_CATEGORIES.find((c) => c.id === mainTab) ??
        FORMULA_CATEGORIES[0]);

  return createPortal(
    <div
      className={styles.panel}
      data-mode={mainTab === "library" ? "library" : "symbols"}
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label={t("editor.formulaPalette")}
    >
      <div
        className={styles.head}
        onPointerDown={onPointerDownHead}
        onPointerMove={onPointerMoveHead}
        onPointerUp={onPointerUpHead}
        onPointerCancel={onPointerUpHead}
      >
        <span className={styles.title}>{t("editor.formulaPalette")}</span>
        <button
          type="button"
          className={styles.close}
          aria-label={t("editor.formulaPaletteClose")}
          title={t("editor.formulaPaletteClose")}
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
        >
          ×
        </button>
      </div>

      <div className={styles.tabs} role="tablist">
        {FORMULA_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            className={styles.tab}
            data-active={mainTab === c.id || undefined}
            aria-selected={mainTab === c.id}
            onClick={() => setMainTab(c.id)}
          >
            {t(`editor.formulaCat.${c.id}` as MessageKey)}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          className={styles.tab}
          data-active={mainTab === "library" || undefined}
          aria-selected={mainTab === "library"}
          onClick={() => setMainTab("library")}
        >
          {t("editor.formulaModeLibrary")}
        </button>
      </div>

      {mainTab === "library" ? (
        <>
          <div className={styles.libToolbar}>
            <input
              className={styles.libSearch}
              type="search"
              value={libQuery}
              placeholder={t("editor.formulaLibSearch")}
              aria-label={t("editor.formulaLibSearch")}
              onChange={(e) => setLibQuery(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
            />
            <div className={styles.libFilterLabel}>
              {t("editor.formulaLibGradeLabel")}
            </div>
            <div className={styles.tabs} role="tablist">
              <button
                type="button"
                role="tab"
                className={styles.tab}
                data-active={libGrade === "all" || undefined}
                aria-selected={libGrade === "all"}
                onClick={() => setLibGrade("all")}
              >
                {t("editor.formulaLibGrade.all")}
              </button>
              {FORMULA_LIB_GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  role="tab"
                  className={styles.tab}
                  data-active={libGrade === g || undefined}
                  aria-selected={libGrade === g}
                  onClick={() => setLibGrade(g)}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className={styles.libFilterLabel}>
              {t("editor.formulaLibCatLabel")}
            </div>
            <div className={styles.tabs} role="tablist">
              <button
                type="button"
                role="tab"
                className={styles.tab}
                data-active={libCat === "all" || undefined}
                aria-selected={libCat === "all"}
                onClick={() => setLibCat("all")}
              >
                {t("editor.formulaLibCat.all")}
              </button>
              {FORMULA_LIB_CATS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  className={styles.tab}
                  data-active={libCat === c || undefined}
                  aria-selected={libCat === c}
                  onClick={() => setLibCat(c)}
                >
                  {t(`editor.formulaLibCat.${c}` as MessageKey)}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.libList}>
            {libError ? (
              <p className={styles.libEmpty}>{t("editor.formulaLibError")}</p>
            ) : !libItems ? (
              <p className={styles.libEmpty}>{t("editor.formulaLibLoading")}</p>
            ) : filteredLib.length === 0 ? (
              <p className={styles.libEmpty}>{t("editor.formulaLibEmpty")}</p>
            ) : (
              filteredLib.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.libItem}
                  title={item.latex}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertLatex(item.latex)}
                >
                  <span className={styles.libName}>{item.name}</span>
                  <span className={styles.libMeta}>
                    {[item.categoryZh, item.sub, item.grade]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className={styles.libText}>{item.text}</span>
                </button>
              ))
            )}
          </div>
          <p className={styles.hint}>
            {t("editor.formulaLibHint", {
              n: String(filteredLib.length),
            })}
          </p>
        </>
      ) : (
        <>
          <div
            className={styles.grid}
            data-captions={
              symbolCat?.symbols.some((s) => s.showCaption) || undefined
            }
          >
            {(symbolCat?.symbols ?? []).map((sym) => {
              const title = sym.titleKey
                ? t(`editor.formulaSym.${sym.titleKey}` as MessageKey)
                : sym.label;
              return (
                <button
                  key={`${symbolCat?.id}-${sym.latex}-${sym.label}`}
                  type="button"
                  className={styles.sym}
                  title={title}
                  aria-label={title}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertSym(sym)}
                >
                  <span className={styles.symGlyph}>{sym.label}</span>
                  {sym.showCaption ? (
                    <span className={styles.symCaption}>{title}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className={styles.hint}>{t("editor.formulaPaletteHint")}</p>
        </>
      )}
    </div>,
    document.body,
  );
}
