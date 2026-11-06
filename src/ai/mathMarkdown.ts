/**
 * AI / Markdown 公式约定：
 * - 块级 `<div data-type="math-block" data-latex="..."></div>`
 * - 行内 `<span data-type="math-inline" data-latex="..."></span>`
 * 并把常见 `$…$` / `$$…$$` 转成上述 HTML；再抢救裸 TeX 命令（避开代码块与已有公式）。
 * 落盘前还会把 GFM 管道表转成 HTML table。
 */

import { convertGfmTablesToHtml } from "@/editor/markdownTables";

const MATH_SLOT = (i: number) => `\uE000MATH${i}\uE001`;
const MATH_SLOT_RE = /\uE000MATH(\d+)\uE001/g;

/** 常见会裸写进正文的 TeX 命令（不含单字母变量） */
const TEX_CMD_RE =
  /\\(?:frac|dfrac|tfrac|times|div|sqrt|cdot|cdots|ldots|pm|mp|leq|geq|neq|approx|equiv|sum|prod|int|oint|infty|partial|nabla|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|omega|Omega|mathbb|mathrm|mathbf|mathsf|text|left|right|bigl|bigr|Big|overline|underline|hat|bar|vec|dot|ddot|to|rightarrow|leftarrow|Rightarrow|Leftrightarrow)\b/;

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
  text = text.replace(/```[\s\S]*?```/g, (m) => push(m));
  text = text.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, (m) => push(m));
  text = text.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (m) => push(m));
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

function lineHasBareTex(line: string): boolean {
  return TEX_CMD_RE.test(line);
}

/** 整行几乎是算式（少中文），可做块级 */
function looksLikeStandaloneEquation(s: string): boolean {
  const t = s.trim();
  if (!t || !lineHasBareTex(t)) return false;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) ?? []).length;
  if (cjk >= 4) return false;
  // 允许少量标点前缀以外，主体为公式字符
  const mathish = t.replace(
    /[A-Za-z0-9\\{}^_+\-*/=()\[\].,|;:\s]/g,
    "",
  );
  // 去掉已知 TeX 命令名后不应剩太多杂字
  const stripped = t.replace(TEX_CMD_RE, "");
  const leftoverCjk = (stripped.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return leftoverCjk <= 2 && mathish.length <= 6;
}

/** 句中公式起点：中文说明后的冒号，或第一个反斜杠命令附近的算式头 */
function findInlineMathStart(line: string): number {
  const colon = line.search(/[:：]\s*/);
  if (colon >= 0) {
    const after = colon + (line.slice(colon).match(/^[:：]\s*/)?.[0].length ?? 1);
    if (lineHasBareTex(line.slice(after))) return after;
  }
  const cmd = line.search(TEX_CMD_RE);
  if (cmd < 0) return -1;
  // 向左扩到等式/括号/字母数字起点
  let i = cmd;
  while (i > 0) {
    const ch = line[i - 1]!;
    if (/[\s，。；、！？]/.test(ch)) break;
    if (/[\u4e00-\u9fff]/.test(ch)) break;
    i -= 1;
  }
  return i;
}

/** 单行抢救：有裸 TeX 命令则包成公式节点 */
export function rescueBareTexInLine(line: string): string {
  if (!lineHasBareTex(line)) return line;
  // 已是 HTML 公式（保护失败时）别再包
  if (/data-type\s*=\s*["']math-/i.test(line)) return line;

  const trimmed = line.trim();
  if (looksLikeStandaloneEquation(trimmed)) {
    const lead = line.match(/^\s*/)?.[0] ?? "";
    const trail = line.match(/\s*$/)?.[0] ?? "";
    return `${lead}${mathBlockHtml(trimmed)}${trail}`;
  }

  const start = findInlineMathStart(line);
  if (start < 0) return line;
  const head = line.slice(0, start);
  const rest = line.slice(start);
  const trail = rest.match(/\s*$/)?.[0] ?? "";
  const body = rest.slice(0, rest.length - trail.length).trim();
  if (!body || !lineHasBareTex(body)) return line;
  return `${head}${mathInlineHtml(body)}${trail}`;
}

/**
 * 抢救未包 $ 的裸 TeX（如 4\times\frac{1}{2}）。
 * 跳过代码块 / 已有公式 / 备注；零星无关反斜杠不强转。
 */
export function rescueBareTexCommands(md: string): string {
  if (!md || !md.includes("\\")) return md;
  if (!TEX_CMD_RE.test(md)) return md;
  const { text, slots } = protectMathRegions(md);
  const out = text
    .split("\n")
    .map((line) => rescueBareTexInLine(line))
    .join("\n");
  return restoreMathRegions(out, slots);
}

function normalizeCellMath(cell: string): string {
  return rescueBareTexCommands(convertDollarMathToHtml(cell));
}

/** AI 落盘 / 导出前：GFM 表 → HTML，转 $ 公式，抢救裸 TeX */
export function normalizeMathInMarkdown(md: string): string {
  const withTables = convertGfmTablesToHtml(md, normalizeCellMath);
  return rescueBareTexCommands(convertDollarMathToHtml(withTables));
}
