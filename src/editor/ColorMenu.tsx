/**
 * Word 风格大色板：主题色网格 + 标准色；荧光笔多档浅色。
 */

import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { useI18n } from "@/i18n/useI18n";
import { HIGHLIGHT_COLORS } from "./colorPalettes";
import { ThemeColorPalette } from "@/ui/color/ThemeColorPalette";
import { IconHighlight, IconTextColor } from "./toolbarIcons";
import styles from "./EditorView.module.css";

type MenuKind = "text" | "highlight" | null;

interface ColorMenuProps {
  editor: Editor;
  open: MenuKind;
  onOpenChange: (next: MenuKind) => void;
}

export function ColorMenu({ editor, open, onOpenChange }: ColorMenuProps) {
  const { t } = useI18n();
  const textRef = useRef<HTMLDivElement>(null);
  const hlRef = useRef<HTMLDivElement>(null);

  const activeText =
    (editor.getAttributes("textStyle").color as string | undefined) || "#c00000";
  const activeHl =
    (editor.getAttributes("highlight").color as string | undefined) || "#ffff00";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const tnode = e.target as Node;
      if (open === "text" && textRef.current?.contains(tnode)) return;
      if (open === "highlight" && hlRef.current?.contains(tnode)) return;
      onOpenChange(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const savedSelection = useRef<{ from: number; to: number } | null>(null);

  const captureSelection = () => {
    const { from, to } = editor.state.selection;
    savedSelection.current = { from, to };
  };

  const withSelection = () => {
    let chain = editor.chain().focus();
    const sel = savedSelection.current;
    if (sel) {
      const docSize = editor.state.doc.content.size;
      chain = chain.setTextSelection({
        from: Math.max(0, Math.min(sel.from, docSize)),
        to: Math.max(0, Math.min(sel.to, docSize)),
      });
    }
    return chain;
  };

  const pickText = (value: string) => {
    withSelection().setColor(value).run();
    onOpenChange(null);
  };

  const pickHighlight = (value: string) => {
    withSelection().toggleHighlight({ color: value }).run();
    onOpenChange(null);
  };

  return (
    <>
      <div
        className={styles.menuWrap}
        ref={textRef}
        onMouseDown={captureSelection}
      >
        <button
          type="button"
          className={styles.toolBtn}
          title={t("editor.textColor")}
          aria-label={t("editor.textColor")}
          aria-expanded={open === "text"}
          aria-haspopup="menu"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onOpenChange(open === "text" ? null : "text")}
          data-active={
            Boolean(editor.getAttributes("textStyle").color) || undefined
          }
        >
          <IconTextColor color={activeText} />
        </button>
        {open === "text" && (
          <div className={styles.colorMenuAnchor}>
            <ThemeColorPalette
              activeColor={editor.getAttributes("textStyle").color as
                | string
                | undefined}
              clearLabel={t("editor.colorAuto")}
              onPick={pickText}
              onClear={() => {
                withSelection().unsetColor().run();
                onOpenChange(null);
              }}
              preventMouseDownDefault
            />
          </div>
        )}
      </div>

      <div
        className={styles.menuWrap}
        ref={hlRef}
        onMouseDown={captureSelection}
      >
        <button
          type="button"
          className={styles.toolBtn}
          title={t("editor.highlight")}
          aria-label={t("editor.highlight")}
          aria-expanded={open === "highlight"}
          aria-haspopup="menu"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            onOpenChange(open === "highlight" ? null : "highlight")
          }
          data-active={editor.isActive("highlight") || undefined}
        >
          <IconHighlight color={activeHl} />
        </button>
        {open === "highlight" && (
          <div className={styles.colorMenuWide} role="menu">
            <button
              type="button"
              className={styles.colorClear}
              role="menuitem"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                withSelection().unsetHighlight().run();
                onOpenChange(null);
              }}
            >
              {t("editor.highlightNone")}
            </button>
            <div className={styles.colorSectionLabel}>{t("editor.highlight")}</div>
            <div className={styles.colorHighlightGrid}>
              {HIGHLIGHT_COLORS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={styles.swatch}
                  role="menuitem"
                  title={value}
                  aria-label={value}
                  style={{ background: value }}
                  data-active={
                    editor.isActive("highlight", { color: value }) || undefined
                  }
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickHighlight(value)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
