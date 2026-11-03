/**
 * Word 风格主题色 + 标准色面板（与编辑器「字体颜色」同款）。
 * 纯展示：选色 / 清除由调用方处理。
 */

import type { MouseEvent as ReactMouseEvent } from "react";
import { useI18n } from "@/i18n/useI18n";
import {
  STANDARD_COLORS,
  THEME_COLOR_COLUMNS,
} from "@/editor/colorPalettes";
import styles from "./ThemeColorPalette.module.css";

interface ThemeColorPaletteProps {
  /** 当前选中色（#rrggbb）；无则不高亮格子 */
  activeColor?: string | null;
  /** 清除按钮文案（如「自动」/「恢复默认」） */
  clearLabel: string;
  onPick: (color: string) => void;
  onClear: () => void;
  className?: string;
  /** 阻止 mousedown 抢焦点（编辑器工具栏需要） */
  preventMouseDownDefault?: boolean;
}

function sameColor(a: string | null | undefined, b: string): boolean {
  return Boolean(a && a.toLowerCase() === b.toLowerCase());
}

export function ThemeColorPalette({
  activeColor,
  clearLabel,
  onPick,
  onClear,
  className,
  preventMouseDownDefault = false,
}: ThemeColorPaletteProps) {
  const { t } = useI18n();
  const themeRows = 6;
  const themeCols = THEME_COLOR_COLUMNS.length;
  const guard = preventMouseDownDefault
    ? (e: ReactMouseEvent) => e.preventDefault()
    : undefined;

  return (
    <div
      className={className ? `${styles.root} ${className}` : styles.root}
      role="menu"
    >
      <button
        type="button"
        className={styles.clear}
        role="menuitem"
        onMouseDown={guard}
        onClick={onClear}
      >
        {clearLabel}
      </button>
      <div className={styles.sectionLabel}>{t("editor.colorTheme")}</div>
      <div
        className={styles.themeGrid}
        style={{
          gridTemplateColumns: `repeat(${themeCols}, 1fr)`,
          gridTemplateRows: `repeat(${themeRows}, 1fr)`,
        }}
      >
        {Array.from({ length: themeRows }, (_, row) =>
          THEME_COLOR_COLUMNS.map((col, colIdx) => {
            const value = col[row];
            return (
              <button
                key={`t-${colIdx}-${row}`}
                type="button"
                className={styles.swatch}
                role="menuitem"
                title={value}
                aria-label={value}
                style={{
                  background: value,
                  borderColor:
                    value.toLowerCase() === "#ffffff"
                      ? "var(--wg-border)"
                      : undefined,
                }}
                data-active={sameColor(activeColor, value) || undefined}
                onMouseDown={guard}
                onClick={() => onPick(value)}
              />
            );
          }),
        ).flat()}
      </div>
      <div className={styles.sectionLabel}>{t("editor.colorStandard")}</div>
      <div className={styles.standardRow}>
        {STANDARD_COLORS.map((value) => (
          <button
            key={value}
            type="button"
            className={styles.swatch}
            role="menuitem"
            title={value}
            aria-label={value}
            style={{ background: value }}
            data-active={sameColor(activeColor, value) || undefined}
            onMouseDown={guard}
            onClick={() => onPick(value)}
          />
        ))}
      </div>
    </div>
  );
}
