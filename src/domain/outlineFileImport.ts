/**
 * 从 Markdown / docx 抽大纲树（标题层级 → TreeNode）。
 */

import JSZip from "jszip";
import { createId, createNode } from "./tree";
import {
  blocksToForest,
  type HtmlPasteBlock,
  type StructureSplitResult,
} from "./pasteStructure";

export type OutlineFileKind = "markdown" | "docx";

/** ATX Markdown：# 标题 */
export function splitMarkdownOutline(
  text: string,
  options?: { guideTitle?: string },
): StructureSplitResult {
  const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: HtmlPasteBlock[] = [];
  let buf: string[] = [];

  const flushBuf = () => {
    const t = buf.join("\n").trim();
    buf = [];
    if (t) blocks.push({ level: 0, text: t });
  };

  for (const line of lines) {
    const hm = /^(#{1,6})\s+(.+)$/.exec(line);
    if (hm) {
      flushBuf();
      blocks.push({ level: hm[1]!.length, text: hm[2]!.trim() });
    } else {
      buf.push(line);
    }
  }
  flushBuf();

  const headingCount = blocks.filter((b) => b.level > 0).length;
  if (!headingCount) {
    const body = text.trim();
    return {
      children: body
        ? [
            createNode({
              id: createId(),
              title: options?.guideTitle ?? "导语",
              content: body,
              children: [],
            }),
          ]
        : [],
      hitCount: 0,
      weak: true,
      kind: "none",
    };
  }

  const { children, hitCount } = blocksToForest(blocks);
  if (options?.guideTitle) {
    for (const c of children) {
      if (c.title === "导语") c.title = options.guideTitle;
    }
  }
  return {
    children,
    hitCount,
    weak: hitCount < 2,
    kind: "html",
  };
}

function xmlLocal(name: string): string {
  const i = name.indexOf(":");
  return i >= 0 ? name.slice(i + 1) : name;
}

function textOf(el: Element): string {
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      parts.push(n.nodeValue ?? "");
      return;
    }
    if (n.nodeType !== 1) return;
    const e = n as Element;
    if (xmlLocal(e.tagName) === "tab") parts.push("\t");
    if (xmlLocal(e.tagName) === "br") parts.push("\n");
    for (const c of Array.from(e.childNodes)) walk(c);
  };
  walk(el);
  return parts.join("").replace(/\s+/g, " ").trim();
}

function headingLevelFromPpr(pPr: Element | null): number {
  if (!pPr) return 0;
  for (const child of Array.from(pPr.children)) {
    const local = xmlLocal(child.tagName);
    if (local === "outlineLvl") {
      const v = child.getAttribute("w:val") ?? child.getAttribute("val");
      if (v != null && v !== "") {
        const n = Number(v) + 1;
        if (n >= 1 && n <= 6) return n;
      }
    }
    if (local === "pStyle") {
      const v = child.getAttribute("w:val") ?? child.getAttribute("val") ?? "";
      const m = /heading\s*([1-6])/i.exec(v);
      if (m) return Number(m[1]);
      if (/^Title$/i.test(v)) return 1;
    }
  }
  return 0;
}

/** 解析 docx ArrayBuffer → 结构拆分结果（仅 Heading / outlineLvl） */
export async function splitDocxOutline(
  data: ArrayBuffer,
  options?: { guideTitle?: string },
): Promise<StructureSplitResult> {
  const zip = await JSZip.loadAsync(data);
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    return { children: [], hitCount: 0, weak: true, kind: "none" };
  }
  const xml = await docFile.async("string");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const blocks: HtmlPasteBlock[] = [];

  const all = doc.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i]!;
    if (xmlLocal(el.tagName) !== "p") continue;
    // 跳过嵌套在表格等深层的？仍收录段落
    let pPr: Element | null = null;
    for (const c of Array.from(el.children)) {
      if (xmlLocal(c.tagName) === "pPr") {
        pPr = c;
        break;
      }
    }
    const level = headingLevelFromPpr(pPr);
    const text = textOf(el);
    if (!text) continue;
    blocks.push({ level, text });
  }

  const headingCount = blocks.filter((b) => b.level > 0).length;
  if (!headingCount) {
    const plain = blocks.map((b) => b.text).join("\n\n").trim();
    return {
      children: plain
        ? [
            createNode({
              id: createId(),
              title: options?.guideTitle ?? "导语",
              content: plain,
              children: [],
            }),
          ]
        : [],
      hitCount: 0,
      weak: true,
      kind: "none",
    };
  }

  const { children, hitCount } = blocksToForest(blocks);
  if (options?.guideTitle) {
    for (const c of children) {
      if (c.title === "导语") c.title = options.guideTitle;
    }
  }
  return {
    children,
    hitCount,
    weak: hitCount < 2,
    kind: "html",
  };
}

export function detectOutlineFileKind(
  fileName: string,
): OutlineFileKind | null {
  const n = fileName.toLowerCase();
  if (n.endsWith(".md") || n.endsWith(".markdown")) return "markdown";
  if (n.endsWith(".docx")) return "docx";
  return null;
}
