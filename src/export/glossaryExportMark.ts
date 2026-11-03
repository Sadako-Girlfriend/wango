/**
 * 导出用：把词表引用标成 HTML span，供 PDF / 长图 TipTap（html:true）还原彩色外观。
 * 不改存盘 Markdown；仅在离屏渲染前临时包装。
 */

import {
  glossaryLinkStyle,
  shouldHighlightLink,
  type GlossaryLink,
} from "@/domain";

export type GlossaryExportPaint = {
  links: GlossaryLink[];
  colors: Record<string, string>;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 在 host 节点正文 Markdown 上，按 link 偏移（自后向前）包一层 .wg-glossary-link。
 */
export function applyGlossaryMarksToMarkdown(
  md: string,
  links: GlossaryLink[],
  hostNodeId: string,
  colors: Record<string, string>,
): string {
  if (!md || !links.length) return md;

  const relevant = links
    .filter(
      (l) =>
        l.hostNodeId === hostNodeId &&
        shouldHighlightLink(l) &&
        Boolean(l.matchedText) &&
        l.end > l.start,
    )
    .sort((a, b) => b.start - a.start || b.end - a.end);

  let out = md;
  for (const link of relevant) {
    let from = link.start;
    let to = link.end;
    if (from < 0 || to > out.length || from >= to) continue;

    const slice = out.slice(from, to);
    if (slice !== link.matchedText) {
      const hint = Math.max(0, link.start - 32);
      const idx = out.indexOf(link.matchedText, hint);
      if (idx < 0) continue;
      from = idx;
      to = idx + link.matchedText.length;
    }

    const style = glossaryLinkStyle(colors[link.entryId]);
    const open = style
      ? `<span class="wg-glossary-link" style="${style}">`
      : `<span class="wg-glossary-link">`;
    const inner = escapeHtml(out.slice(from, to));
    out = `${out.slice(0, from)}${open}${inner}</span>${out.slice(to)}`;
  }
  return out;
}
