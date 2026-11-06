/**
 * AI / Markdown 公式约定：
 * - 块级 `<div data-type="math-block" data-latex="..."></div>`
 * - 行内 `<span data-type="math-inline" data-latex="..."></span>`
 * 并把常见 `$…$` / `$$…$$` 转成上述 HTML（避开代码块与已有公式）。
 */

const MATH_SLOT = (i: number) => `\uE000MATH${i}\uE001`;
const MATH_SLOT_RE = /\uE000MATH(\d+)\uE001/g;

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function mathBlockHtml(latex: string): string {
  const t = latex.trim();
  const a = escapeAttr(t);
  return `<div data-type="math-block" data-latex="${a}">${a}</div>`;
}

export function mathInlineHtml(latex: string): string {
  const t = latex.trim();
  const a = escapeAttr(t);
  return `<span data-type="math-inline" data-latex="${a}">${a}</span>`;
}

/** 抽出已有公式 / 代码围栏 / 备注，避免二次转换 */
export function protectMathRegions(md: string): {
  text: string;
  slots: string[];
} {
  const slots: string[] = [];
  const push = (m: string) => {
    const i = slots.length;
    slots.push(m);
    return MATH_SLOT(i);
  };
  let text = md;
  text = text.replace(
    /```[\s\S]*?```/g,
    (m) => push(m),
  );
  text = text.replace(
    /<aside\b[^>]*\bdata-type\s*=\s*["']callout["'][^>]*>[\s\S]*?<\/aside>/gi,
    (m) => push(m),
  );
  text = text.replace(
    /<div\b[^>]*\bdata-type\s*=\s*["']math-block["'][^>]*>[\s\S]*?<\/div>/gi,
    (m) => push(m),
  );
  text = text.replace(
    /<span\b[^>]*\bdata-type\s*=\s*["']math-inline["'][^>]*>[\s\S]*?<\/span>/gi,
    (m) => push(m),
  );
  return { text, slots };
}

export function restoreMathRegions(text: string, slots: string[]): string {
  return text.replace(MATH_SLOT_RE, (_, i) => slots[Number(i)] ?? "");
}

/**
 * 把 `$$…$$` → 块级公式，`$…$` → 行内公式。
 * 跳过代码块、已有公式、备注；尽量避开 `$5` 这类货币写法。
 */
export function convertDollarMathToHtml(md: string): string {
  if (!md || !md.includes("$")) return md;
  const { text, slots } = protectMathRegions(md);
  let out = text;

  // 块级 $$...$$（可跨行）
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_, raw: string) => {
    const latex = String(raw).trim();
    if (!latex) return "$$$$";
    return mathBlockHtml(latex);
  });

  // 行内 $...$：同一行内；内容须像公式（含字母/运算符），避免纯数字货币
  out = out.replace(
    /(?<!\$)\$(?!\$)((?:\\\$|[^$\n])+?)\$(?!\$)/g,
    (whole, raw: string) => {
      const latex = String(raw).trim();
      if (!latex) return whole;
      // `$5` / `$12.3` 当货币
      if (/^\d+(?:[.,]\d+)?$/.test(latex)) return whole;
      // 太短且无 TeX 味：单字符非字母
      if (latex.length === 1 && !/[a-zA-Zα-ωΑ-Ω]/.test(latex)) return whole;
      return mathInlineHtml(latex);
    },
  );

  return restoreMathRegions(out, slots);
}

/** AI 落盘前：转 $ 公式 + 保留已有 HTML 公式 */
export function normalizeMathInMarkdown(md: string): string {
  return convertDollarMathToHtml(md);
}
