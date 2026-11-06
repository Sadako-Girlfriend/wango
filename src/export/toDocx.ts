/**
 * 导出 Word（.docx）：标题/段落/列表为可编辑文本；
 * 代码块与备注框截成 PNG 嵌入，避免排版错乱。
 */

import {
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
  convertInchesToTwip,
  type FileChild,
  type IRunOptions,
  type ParagraphChild,
} from "docx";
import type { ProjectData } from "@/domain";
import {
  findNodeById,
  getNumberById,
  withNumbering,
  withNumberingFrom,
  type NumberedTreeNode,
} from "@/domain";
import { rewriteMarkdownForDisplay } from "@/desktop/mediaUrl";
import {
  captureElementPng,
  dataUrlToUint8Array,
  mountExportDocument,
  numberedToMarkdown,
} from "./longImageCapture";

export type DocxScope = "project" | "node";
export type DocxNumbering = "restart" | "preserve";

export interface DocxOptions {
  scope: DocxScope;
  nodeId?: string | null;
  numbering?: DocxNumbering;
}

/** 内容区可用宽度（约 A4 页边距后），单位 px@96dpi */
const CONTENT_WIDTH_PX = 620;
const BULLET_REF = "wg-bullets";
const ORDERED_REF = "wg-ordered";

const HEADING_MAP = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

function resolveExport(
  project: ProjectData,
  options: DocxOptions,
): { numbered: NumberedTreeNode[]; title: string } {
  if (options.scope === "node") {
    const id = options.nodeId;
    if (!id) throw new Error("未选中节点，无法导出当前节点 Word");
    const node = findNodeById(project.tree, id);
    if (!node) throw new Error("找不到当前节点");
    const title = node.title.trim() || project.name.trim() || "未命名";
    const numbering = options.numbering ?? "restart";
    if (numbering === "preserve") {
      const sourceNo = getNumberById(project.tree, id) || "1";
      return { numbered: [withNumberingFrom(node, sourceNo)], title };
    }
    return { numbered: withNumbering([node]), title };
  }
  return {
    numbered: withNumbering(project.tree),
    title: project.name.trim() || project.tree[0]?.title?.trim() || "未命名项目",
  };
}

function tipTapRoot(exportRoot: HTMLElement): HTMLElement | null {
  return exportRoot.querySelector<HTMLElement>(".tiptap, .ProseMirror");
}

function isCodeBlockEl(el: Element): boolean {
  return Boolean(
    el.matches(".react-renderer.node-codeBlock") ||
      el.querySelector(":scope > [data-wg-codeblock]"),
  );
}

function isCalloutEl(el: Element): boolean {
  return Boolean(
    el.matches(".react-renderer.node-callout, aside[data-type='callout']") ||
      (el instanceof HTMLElement && el.dataset.wgCallout === "1"),
  );
}

function isMathBlockEl(el: Element): boolean {
  return Boolean(
    el.matches(
      ".react-renderer.node-mathBlock, .react-renderer.node-mathInline, div[data-type='math-block'], span[data-type='math-inline'], div.wg-math-block, span.wg-math-inline",
    ) ||
      (el instanceof HTMLElement && el.dataset.wgMath === "1") ||
      el.querySelector(
        ":scope > [data-wg-math], :scope > [data-type='math-block'], :scope > [data-type='math-inline']",
      ),
  );
}

function isImageBlockEl(el: Element): boolean {
  return Boolean(
    el.matches(".react-renderer.node-image") ||
      (el.tagName === "IMG" &&
        !el.closest("[data-wg-codeblock],[data-wg-callout],[data-wg-math]")),
  );
}

function captureTarget(el: HTMLElement): HTMLElement {
  const code = el.matches("[data-wg-codeblock]")
    ? el
    : el.querySelector<HTMLElement>("[data-wg-codeblock]");
  if (code) return code;
  const callout = el.matches("[data-wg-callout], aside[data-type='callout']")
    ? el
    : el.querySelector<HTMLElement>("[data-wg-callout], aside[data-type='callout']");
  if (callout) return callout;
  const math = el.matches(
    "[data-wg-math], div[data-type='math-block'], span[data-type='math-inline']",
  )
    ? el
    : el.querySelector<HTMLElement>(
        "[data-wg-math], div[data-type='math-block'], span[data-type='math-inline']",
      );
  if (math) return math;
  return el;
}

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  return { width: CONTENT_WIDTH_PX, height: 120 };
}

function fitWidth(
  naturalW: number,
  naturalH: number,
  maxW = CONTENT_WIDTH_PX,
): { width: number; height: number } {
  const w = Math.max(1, naturalW);
  const h = Math.max(1, naturalH);
  if (w <= maxW) return { width: Math.round(w), height: Math.round(h) };
  const s = maxW / w;
  return { width: Math.round(w * s), height: Math.round(h * s) };
}

async function elementToImageParagraph(
  el: HTMLElement,
  label: string,
  backgroundColor: string | null,
  options?: { stripMathChrome?: boolean },
): Promise<Paragraph> {
  const target = captureTarget(el);
  // Word 截的是编辑区 DOM：临时挂 data-wg-export，复用公式「去边框」样式
  const stripChrome = Boolean(options?.stripMathChrome);
  const hadExportAttr = target.hasAttribute("data-wg-export");
  if (stripChrome && !hadExportAttr) {
    target.setAttribute("data-wg-export", "1");
  }
  try {
    const dataUrl = await captureElementPng(target, { backgroundColor });
    const bytes = dataUrlToUint8Array(dataUrl);
    const natural = pngSize(bytes);
    // html-to-image 默认 pixelRatio≈2，显示尺寸按 CSS 缩小
    const cssW = Math.max(target.scrollWidth, target.offsetWidth, 1);
    const cssH = Math.max(
      1,
      Math.round((natural.height / Math.max(natural.width, 1)) * cssW),
    );
    const size = fitWidth(cssW, cssH);
    return new Paragraph({
      spacing: { before: 120, after: 120 },
      children: [
        new ImageRun({
          type: "png",
          data: bytes,
          transformation: size,
          altText: {
            title: label,
            description: label,
            name: label,
          },
        }),
      ],
    });
  } finally {
    if (stripChrome && !hadExportAttr) {
      target.removeAttribute("data-wg-export");
    }
  }
}

async function imgElToParagraph(img: HTMLImageElement): Promise<Paragraph | null> {
  if (!img.complete || img.naturalWidth <= 0) return null;
  try {
    let bytes: Uint8Array;
    let type: "png" | "jpg" | "gif" | "bmp" = "png";
    const src = img.currentSrc || img.src;
    if (src.startsWith("data:")) {
      const m = /^data:image\/([\w+.-]+);base64,(.+)$/i.exec(src);
      if (!m) return null;
      const mime = m[1].toLowerCase();
      if (mime.includes("jpeg") || mime.includes("jpg")) type = "jpg";
      else if (mime.includes("gif")) type = "gif";
      else if (mime.includes("bmp")) type = "bmp";
      else type = "png";
      const bin = atob(m[2]);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    } else {
      const res = await fetch(src);
      const buf = new Uint8Array(await res.arrayBuffer());
      bytes = buf;
      if (/jpe?g/i.test(src) || res.headers.get("content-type")?.includes("jpeg")) {
        type = "jpg";
      } else if (/gif/i.test(src)) type = "gif";
      else if (/bmp/i.test(src)) type = "bmp";
    }
    const size = fitWidth(img.naturalWidth, img.naturalHeight);
    return new Paragraph({
      spacing: { before: 120, after: 120 },
      children: [
        new ImageRun({
          type,
          data: bytes,
          transformation: size,
          altText: {
            title: img.alt || "image",
            description: img.alt || "image",
            name: img.alt || "image",
          },
        }),
      ],
    });
  } catch {
    return null;
  }
}

function parseColor(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    return h.toUpperCase();
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
  if (rgb) {
    const to = (n: string) =>
      Math.max(0, Math.min(255, Number(n)))
        .toString(16)
        .padStart(2, "0");
    return `${to(rgb[1])}${to(rgb[2])}${to(rgb[3])}`.toUpperCase();
  }
  return undefined;
}

type InlineStyle = {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  color?: string;
  highlight?: string;
  link?: string;
};

function mergeStyle(base: InlineStyle, patch: InlineStyle): InlineStyle {
  return {
    bold: patch.bold ?? base.bold,
    italics: patch.italics ?? base.italics,
    underline: patch.underline ?? base.underline,
    strike: patch.strike ?? base.strike,
    code: patch.code ?? base.code,
    color: patch.color ?? base.color,
    highlight: patch.highlight ?? base.highlight,
    link: patch.link ?? base.link,
  };
}

function styleFromElement(el: HTMLElement, base: InlineStyle): InlineStyle {
  const tag = el.tagName.toLowerCase();
  const patch: InlineStyle = {};
  if (tag === "strong" || tag === "b") patch.bold = true;
  if (tag === "em" || tag === "i") patch.italics = true;
  if (tag === "u") patch.underline = true;
  if (tag === "s" || tag === "del" || tag === "strike") patch.strike = true;
  if (tag === "code") patch.code = true;
  if (tag === "a") {
    const href = el.getAttribute("href");
    if (href) patch.link = href;
  }
  if (tag === "mark") {
    const bg =
      parseColor(el.style.backgroundColor) ||
      parseColor(el.getAttribute("data-color")) ||
      "FFFF00";
    patch.highlight = bg;
  }
  if (el.style.color) {
    const c = parseColor(el.style.color);
    if (c) patch.color = c;
  }
  const fw = el.style.fontWeight;
  if (fw === "bold" || Number(fw) >= 600) patch.bold = true;
  if (el.style.fontStyle === "italic") patch.italics = true;
  if (el.style.textDecoration?.includes("underline")) patch.underline = true;
  if (el.style.textDecoration?.includes("line-through")) patch.strike = true;
  return mergeStyle(base, patch);
}

function textRunFrom(text: string, style: InlineStyle): ParagraphChild {
  if (!text) return new TextRun("");
  const opts: IRunOptions = {
    text,
    bold: style.bold || undefined,
    italics: style.italics || undefined,
    underline: style.underline ? {} : undefined,
    strike: style.strike || undefined,
    font: style.code ? "Consolas" : undefined,
    size: style.code ? 18 : undefined,
    color: style.color,
    highlight: style.highlight ? "yellow" : undefined,
  };
  const run = new TextRun(opts);
  if (style.link) {
    return new ExternalHyperlink({
      link: style.link,
      children: [run],
    });
  }
  return run;
}

function inlineChildren(node: Node, style: InlineStyle = {}): ParagraphChild[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (!text) return [];
    return [textRunFrom(text, style)];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "br") return [new TextRun({ break: 1 })];
  if (tag === "img") return [];
  const next = styleFromElement(el, style);
  const out: ParagraphChild[] = [];
  for (const child of Array.from(el.childNodes)) {
    out.push(...inlineChildren(child, next));
  }
  return out;
}

function paragraphFromEl(
  el: HTMLElement,
  extras?: { numbering?: { reference: string; level: number } },
): Paragraph {
  const children = inlineChildren(el);
  return new Paragraph({
    spacing: { after: 120 },
    children: children.length ? children : [new TextRun("")],
    numbering: extras?.numbering,
  });
}

function headingFromEl(el: HTMLElement): Paragraph {
  const level = Math.min(
    6,
    Math.max(1, Number(el.tagName.charAt(1)) || 1),
  ) as 1 | 2 | 3 | 4 | 5 | 6;
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return new Paragraph({
    heading: HEADING_MAP[level - 1],
    spacing: { before: level === 1 ? 240 : 200, after: 120 },
    children: [new TextRun(text)],
  });
}

async function listToParagraphs(
  list: HTMLElement,
  level: number,
  ordered: boolean,
): Promise<Paragraph[]> {
  const out: Paragraph[] = [];
  const items = Array.from(list.children).filter(
    (c) => c.tagName.toLowerCase() === "li",
  ) as HTMLElement[];
  for (const li of items) {
    const nested: HTMLElement[] = [];
    for (const child of Array.from(li.children)) {
      if (child.tagName === "UL" || child.tagName === "OL") {
        nested.push(child as HTMLElement);
      }
    }
    // 列表项主文本：去掉嵌套 list 再取 inline
    const main = li.cloneNode(true) as HTMLElement;
    for (const sub of Array.from(main.querySelectorAll(":scope > ul, :scope > ol"))) {
      sub.remove();
    }
    out.push(
      paragraphFromEl(main, {
        numbering: {
          reference: ordered ? ORDERED_REF : BULLET_REF,
          level: Math.min(level, 8),
        },
      }),
    );
    for (const sub of nested) {
      const isOl = sub.tagName.toLowerCase() === "ol";
      out.push(...(await listToParagraphs(sub, level + 1, isOl)));
    }
  }
  return out;
}

async function blockToChildren(el: HTMLElement): Promise<FileChild[]> {
  const tag = el.tagName.toLowerCase();

  if (isCodeBlockEl(el)) {
    return [await elementToImageParagraph(el, "code", "#1e1f26")];
  }
  if (isCalloutEl(el)) {
    return [await elementToImageParagraph(el, "callout", null)];
  }
  if (isMathBlockEl(el)) {
    return [
      await elementToImageParagraph(el, "math", null, {
        stripMathChrome: true,
      }),
    ];
  }
  if (isImageBlockEl(el)) {
    const img =
      el.tagName === "IMG"
        ? (el as HTMLImageElement)
        : el.querySelector("img");
    if (img) {
      const p = await imgElToParagraph(img);
      return p ? [p] : [];
    }
  }
  if (/^h[1-6]$/.test(tag)) {
    return [headingFromEl(el)];
  }
  if (tag === "p") {
    return [paragraphFromEl(el)];
  }
  if (tag === "blockquote") {
    const parts: FileChild[] = [];
    for (const child of Array.from(el.children) as HTMLElement[]) {
      parts.push(...(await blockToChildren(child)));
    }
    if (!parts.length) {
      parts.push(
        new Paragraph({
          indent: { left: convertInchesToTwip(0.25) },
          children: inlineChildren(el),
        }),
      );
    }
    return parts;
  }
  if (tag === "ul") {
    return listToParagraphs(el, 0, false);
  }
  if (tag === "ol") {
    return listToParagraphs(el, 0, true);
  }
  if (tag === "hr") {
    return [
      new Paragraph({
        border: {
          bottom: {
            style: BorderStyle.SINGLE,
            size: 6,
            color: "CCCCCC",
            space: 8,
          },
        },
        children: [],
      }),
    ];
  }
  if (tag === "pre") {
    return [await elementToImageParagraph(el, "code", "#1e1f26")];
  }

  // 未知块：有子块则递归，否则当段落
  const kids = Array.from(el.children) as HTMLElement[];
  if (kids.length && (el.classList.contains("react-renderer") || tag === "div")) {
    // 可能是包了一层的渲染器
    if (kids.length === 1) return blockToChildren(kids[0]);
  }
  if (kids.some((k) => /^(P|H[1-6]|UL|OL|ASIDE|PRE|BLOCKQUOTE)$/.test(k.tagName))) {
    const parts: FileChild[] = [];
    for (const k of kids) parts.push(...(await blockToChildren(k)));
    return parts;
  }
  const text = (el.textContent ?? "").trim();
  if (!text) return [];
  return [paragraphFromEl(el)];
}

async function tipTapToChildren(tip: HTMLElement): Promise<FileChild[]> {
  const out: FileChild[] = [];
  for (const child of Array.from(tip.children) as HTMLElement[]) {
    out.push(...(await blockToChildren(child)));
  }
  return out;
}

/** 将项目（或当前节点子树）导出为 Word .docx Blob */
export async function toDocx(
  project: ProjectData,
  options: DocxOptions,
): Promise<Blob> {
  const { numbered, title } = resolveExport(project, options);
  if (!numbered.length) throw new Error("没有可导出的内容");

  const rawMd = numberedToMarkdown(numbered);
  const markdown = await rewriteMarkdownForDisplay(rawMd);
  const mounted = await mountExportDocument(markdown, title, {
    hideWatermark: true,
  });

  try {
    const tip = tipTapRoot(mounted.root);
    if (!tip) throw new Error("Word 导出渲染失败：找不到正文根节点");

    const body = await tipTapToChildren(tip);
    const children: FileChild[] = [
      new Paragraph({
        heading: HeadingLevel.TITLE,
        spacing: { after: 280 },
        children: [new TextRun({ text: title, bold: true })],
      }),
      ...body,
    ];

    const doc = new Document({
      creator: "WanGou",
      title,
      numbering: {
        config: [
          {
            reference: BULLET_REF,
            levels: [0, 1, 2, 3, 4, 5].map((level) => ({
              level,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: "left",
              style: {
                paragraph: {
                  indent: {
                    left: convertInchesToTwip(0.25 + level * 0.25),
                    hanging: convertInchesToTwip(0.2),
                  },
                },
              },
            })),
          },
          {
            reference: ORDERED_REF,
            levels: [0, 1, 2, 3, 4, 5].map((level) => ({
              level,
              format: LevelFormat.DECIMAL,
              text: `%${level + 1}.`,
              alignment: "left",
              style: {
                paragraph: {
                  indent: {
                    left: convertInchesToTwip(0.25 + level * 0.25),
                    hanging: convertInchesToTwip(0.25),
                  },
                },
              },
            })),
          },
        ],
      },
      styles: {
        default: {
          document: {
            run: {
              font: "Microsoft YaHei",
              size: 21,
            },
            paragraph: {
              spacing: { line: 360 },
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(0.9),
                right: convertInchesToTwip(0.9),
                bottom: convertInchesToTwip(0.9),
                left: convertInchesToTwip(0.9),
              },
            },
          },
          children,
        },
      ],
    });

    return Packer.toBlob(doc);
  } finally {
    mounted.dispose();
  }
}
