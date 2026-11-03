/**
 * 段落行距（leading）：挂在 paragraph 块属性上，渲染为 CSS line-height。
 *
 * 边界（禁止耦合）：
 * - 只改 paragraph.attrs.lineHeight；不碰 textStyle / 字号 / 段间距 margin。
 * - 不读 store、不改粘贴消毒、不碰词条扫链。
 * - 仅无单位倍数（如 1.5）；非法值校验后 no-op。
 */

import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    lineHeight: {
      setLineHeight: (value: string) => ReturnType;
      unsetLineHeight: () => ReturnType;
    };
  }
}

/** 工具栏预设（无单位倍数） */
export const LINE_HEIGHT_PRESETS = [
  "1",
  "1.15",
  "1.5",
  "1.75",
  "2",
  "2.5",
] as const;

const LINE_HEIGHT_MIN = 0.8;
const LINE_HEIGHT_MAX = 4;

/**
 * 规范化用户/HTML 输入为可存盘的倍数字符串；非法返回 null。
 */
export function normalizeLineHeight(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = String(raw).trim().toLowerCase();
  if (!s || s === "normal" || s === "inherit" || s === "initial") return null;
  // 误带单位时只取数字前缀（不支持 px 行距第一版）
  const m = /^(\d+(?:\.\d+)?)\s*(?:em|%)?$/.exec(s);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < LINE_HEIGHT_MIN || n > LINE_HEIGHT_MAX) {
    return null;
  }
  // 去掉多余尾零：1.50 → 1.5，1.0 → 1
  const normalized = String(Number(n.toFixed(3)));
  return normalized;
}

export const LineHeight = Extension.create({
  name: "lineHeight",

  addOptions() {
    return {
      types: ["paragraph"] as string[],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              normalizeLineHeight(element.style.lineHeight),
            renderHTML: (attributes: { lineHeight?: string | null }) => {
              const v = normalizeLineHeight(attributes.lineHeight);
              if (!v) return {};
              return { style: `line-height: ${v}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight:
        (value: string) =>
        ({ commands }) => {
          const v = normalizeLineHeight(value);
          if (!v) return false;
          return this.options.types.every((type: string) =>
            commands.updateAttributes(type, { lineHeight: v }),
          );
        },
      unsetLineHeight:
        () =>
        ({ commands }) =>
          this.options.types.every((type: string) =>
            commands.resetAttributes(type, "lineHeight"),
          ),
    };
  },
});
