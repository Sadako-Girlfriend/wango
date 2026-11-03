/**
 * 词条引用装饰层（TipTap / ProseMirror）。
 *
 * 设计约束（与业务解耦）：
 * - 只读 `GlossaryLink[]` 画高亮，不改 Markdown 存盘内容。
 * - 不依赖 React / Zustand；由 EditorView 把 store 里的 links 经 command 灌进来。
 * - 点击只派发 DOM CustomEvent，跳转逻辑留给上层 UI。
 *
 * 偏移说明：
 * 扫链按 Markdown 原文字符偏移持久化；编辑器里 `**加粗**` / HTML 备注块
 * 不会出现在 doc.textContent 里，故**不能**把 md 偏移直接当纯文本下标。
 * 手动高亮只按 matchedText + occurrenceIndex 在纯文本中定位，与自动链占坑脱钩。
 */

import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  glossaryLinkStyle,
  shouldHighlightLink,
  type GlossaryLink,
} from "@/domain";
import { t } from "@/i18n";

export const glossaryPluginKey = new PluginKey("wgGlossaryLinks");

/** 插件内部状态：当前 host 节点上的链接快照 */
export type GlossaryDecorationMeta = {
  links: GlossaryLink[];
  hostNodeId: string;
  /** entryId → #rrggbb；缺省走主题色 */
  entryColors?: Record<string, string>;
  /** entryId → 展示名 */
  entryTitles?: Record<string, string>;
  /** entryId → 正文预览（悬浮主内容） */
  entryBodies?: Record<string, string>;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    glossaryDecorations: {
      setGlossaryLinks: (
        links: GlossaryLink[],
        hostNodeId: string,
        entryColors?: Record<string, string>,
        entryTitles?: Record<string, string>,
        entryBodies?: Record<string, string>,
      ) => ReturnType;
    };
  }
}

/** 纯文本下标 → ProseMirror 位置（含末尾哨兵） */
function buildPlainOffsetToPos(doc: PmNode): number[] {
  const plainLen = doc.textContent.length;
  const map: number[] = new Array(plainLen + 1);
  let seen = 0;
  let lastPos = 0;
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    for (let i = 0; i < node.text.length; i++) {
      map[seen + i] = pos + i;
    }
    seen += node.text.length;
    lastPos = pos + node.text.length;
  });
  map[plainLen] = lastPos;
  return map;
}

function paintsDecoration(link: GlossaryLink): boolean {
  return shouldHighlightLink(link);
}

function findPlainOccurrences(
  plain: string,
  needle: string,
): Array<{ from: number; to: number }> {
  if (!needle || !plain.includes(needle)) return [];
  const out: Array<{ from: number; to: number }> = [];
  let fromIdx = 0;
  while (fromIdx <= plain.length - needle.length) {
    const idx = plain.indexOf(needle, fromIdx);
    if (idx < 0) break;
    out.push({ from: idx, to: idx + needle.length });
    fromIdx = idx + 1;
  }
  return out;
}

/**
 * 只绘制手动高亮：按 occurrenceIndex（缺省按同文 start 序）对齐纯文本出现。
 * 自动链不参与占坑，避免「绑上同名词条却看不到下划线」。
 */
export function mapActiveDecorationRanges(
  plain: string,
  links: GlossaryLink[],
  hostNodeId: string,
): Array<{ link: GlossaryLink; from: number; to: number }> {
  const manuals = links
    .filter(
      (l) =>
        l.hostNodeId === hostNodeId &&
        Boolean(l.matchedText) &&
        paintsDecoration(l),
    )
    .sort(
      (a, b) =>
        a.start - b.start ||
        b.end - a.end ||
        a.id.localeCompare(b.id),
    );

  const painted: Array<{ link: GlossaryLink; from: number; to: number }> = [];
  const shareHit = new Map<string, { from: number; to: number }>();
  /** text → 已占用的纯文本出现下标（无 occurrenceIndex 时顺序分配） */
  const usedByText = new Map<string, Set<number>>();

  for (const link of manuals) {
    const text = link.matchedText;
    const shareKey = `${link.start}:${link.end}:${text}`;
    if (shareHit.has(shareKey)) {
      const hit = shareHit.get(shareKey)!;
      painted.push({ link, from: hit.from, to: hit.to });
      continue;
    }

    const occ = findPlainOccurrences(plain, text);
    if (!occ.length) continue;

    const used = usedByText.get(text) ?? new Set<number>();
    usedByText.set(text, used);

    let idx =
      link.occurrenceIndex != null && link.occurrenceIndex >= 0
        ? link.occurrenceIndex
        : -1;
    if (idx < 0 || idx >= occ.length || used.has(idx)) {
      idx = -1;
      for (let i = 0; i < occ.length; i++) {
        if (!used.has(i)) {
          idx = i;
          break;
        }
      }
    }
    if (idx < 0) continue;

    used.add(idx);
    const hit = occ[idx];
    shareHit.set(shareKey, hit);
    painted.push({ link, from: hit.from, to: hit.to });
  }

  return painted;
}

function buildHoverTip(
  links: GlossaryLink[],
  entryTitles?: Record<string, string>,
  entryBodies?: Record<string, string>,
): string | undefined {
  const blocks: string[] = [];
  const seen = new Set<string>();
  for (const l of links) {
    if (seen.has(l.entryId)) continue;
    seen.add(l.entryId);
    const name =
      entryTitles?.[l.entryId]?.trim() || l.matchedText || l.anchorText || "";
    const body = (entryBodies?.[l.entryId] || "").trim();
    if (body) {
      blocks.push(name ? `${name}\n${body}` : body);
    } else if (name) {
      blocks.push(t("glossary.linkTooltipEmptyBody", { title: name }));
    }
  }
  return blocks.length ? blocks.join("\n\n· · ·\n\n") : undefined;
}

function decorationsForLinks(
  doc: PmNode,
  links: GlossaryLink[],
  hostNodeId: string,
  entryColors?: Record<string, string>,
  entryTitles?: Record<string, string>,
  entryBodies?: Record<string, string>,
): DecorationSet {
  const plain = doc.textContent;
  const painted = mapActiveDecorationRanges(plain, links, hostNodeId);
  if (!painted.length) return DecorationSet.empty;

  const groups = new Map<
    string,
    { from: number; to: number; links: GlossaryLink[] }
  >();
  for (const p of painted) {
    const key = `${p.from}:${p.to}`;
    const g = groups.get(key);
    if (g) g.links.push(p.link);
    else groups.set(key, { from: p.from, to: p.to, links: [p.link] });
  }

  const offsetToPos = buildPlainOffsetToPos(doc);
  const decos: Decoration[] = [];
  for (const g of groups.values()) {
    const pmFrom = offsetToPos[g.from];
    const pmTo = offsetToPos[g.to];
    if (pmFrom == null || pmTo == null || pmFrom >= pmTo) continue;
    const primary = g.links[0];
    const entryIds = [
      ...new Set(g.links.map((l) => l.entryId).filter(Boolean)),
    ];
    const tip = buildHoverTip(g.links, entryTitles, entryBodies);
    const colored = g.links.find((l) => entryColors?.[l.entryId]);
    const style = glossaryLinkStyle(
      entryColors?.[(colored ?? primary).entryId],
    );
    decos.push(
      Decoration.inline(pmFrom, pmTo, {
        class: "wg-glossary-link",
        "data-glossary-entry": primary.entryId,
        "data-glossary-entries": entryIds.join(","),
        "data-glossary-link": primary.id,
        ...(tip ? { "data-glossary-tip": tip } : {}),
        ...(style ? { style } : {}),
      }),
    );
  }
  return DecorationSet.create(doc, decos);
}

export const GlossaryDecorations = Extension.create({
  name: "glossaryDecorations",

  addCommands() {
    return {
      setGlossaryLinks:
        (links, hostNodeId, entryColors, entryTitles, entryBodies) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(glossaryPluginKey, {
              links,
              hostNodeId,
              entryColors,
              entryTitles,
              entryBodies,
            } satisfies GlossaryDecorationMeta);
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    /** 单击延迟，以便与双击区分 */
    let clickTimer: ReturnType<typeof setTimeout> | null = null;

    const readEntryIds = (el: HTMLElement): string[] => {
      const many = el.getAttribute("data-glossary-entries");
      if (many) {
        return many
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      const one = el.getAttribute("data-glossary-entry");
      return one ? [one] : [];
    };

    return [
      new Plugin({
        key: glossaryPluginKey,
        state: {
          init: () =>
            ({
              links: [],
              hostNodeId: "",
            }) as GlossaryDecorationMeta,
          apply(tr, value) {
            const meta = tr.getMeta(glossaryPluginKey) as
              | GlossaryDecorationMeta
              | undefined;
            return meta ?? value;
          },
        },
        props: {
          decorations(state) {
            const meta = glossaryPluginKey.getState(state) as
              | GlossaryDecorationMeta
              | undefined;
            if (!meta?.hostNodeId) return DecorationSet.empty;
            return decorationsForLinks(
              state.doc,
              meta.links,
              meta.hostNodeId,
              meta.entryColors,
              meta.entryTitles,
              meta.entryBodies,
            );
          },
          handleClick(view, _pos, event) {
            const t = event.target;
            if (!(t instanceof HTMLElement)) return false;
            const el = t.closest(".wg-glossary-link");
            if (!(el instanceof HTMLElement)) return false;
            if (event.button !== 0) return false;
            const entryIds = readEntryIds(el);
            if (!entryIds.length) return false;
            const primaryId =
              el.getAttribute("data-glossary-entry") || entryIds[0];
            if (clickTimer) clearTimeout(clickTimer);
            const { clientX, clientY } = event;
            clickTimer = setTimeout(() => {
              clickTimer = null;
              view.dom.dispatchEvent(
                new CustomEvent("wg-glossary-click", {
                  bubbles: true,
                  detail: { entryIds, primaryId, clientX, clientY },
                }),
              );
            }, 280);
            return true;
          },
          handleDOMEvents: {
            dblclick(view, event) {
              const t = event.target;
              if (!(t instanceof HTMLElement)) return false;
              const el = t.closest(".wg-glossary-link");
              if (!(el instanceof HTMLElement)) return false;
              event.preventDefault();
              if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
              }
              const entryIds = readEntryIds(el);
              const primaryId =
                el.getAttribute("data-glossary-entry") || entryIds[0];
              if (!primaryId) return true;
              view.dom.dispatchEvent(
                new CustomEvent("wg-glossary-dblclick", {
                  bubbles: true,
                  detail: { entryIds, primaryId },
                }),
              );
              return true;
            },
            contextmenu(view, event) {
              const t = event.target;
              if (!(t instanceof HTMLElement)) return false;
              const el = t.closest(".wg-glossary-link");
              if (!(el instanceof HTMLElement)) return false;
              event.preventDefault();
              if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
              }
              const entryId = el.getAttribute("data-glossary-entry");
              const text = el.textContent || "";
              view.dom.dispatchEvent(
                new CustomEvent("wg-glossary-contextmenu", {
                  bubbles: true,
                  detail: {
                    clientX: event.clientX,
                    clientY: event.clientY,
                    entryId,
                    text,
                  },
                }),
              );
              return true;
            },
          },
        },
      }),
    ];
  },
});
