/**
 * 离屏 TipTap → PNG data URL：长图 PDF / 内容图片共用。
 */

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toPng } from "html-to-image";
import type { NumberedTreeNode } from "@/domain";
import { getAppSettings } from "@/desktop/appSettings";
import { rewriteMarkdownForDisplay } from "@/desktop/mediaUrl";
import {
  applyGlossaryMarksToMarkdown,
  type GlossaryExportPaint,
} from "./glossaryExportMark";
import { LongPdfDocument } from "./LongPdfDocument";

export type { GlossaryExportPaint };

const MAX_SIDE = 12000;
const CSS_WIDTH = 794;

export function walkNumberedMarkdown(
  node: NumberedTreeNode,
  depth: number,
  chunks: string[],
  glossaryPaint?: GlossaryExportPaint,
) {
  const level = Math.min(Math.max(depth, 1), 6);
  const hashes = "#".repeat(level);
  chunks.push(`${hashes} ${node.number} ${node.title}`);
  const rawBody = node.content.trim();
  if (rawBody) {
    const body = glossaryPaint
      ? applyGlossaryMarksToMarkdown(
          rawBody,
          glossaryPaint.links,
          node.id,
          glossaryPaint.colors,
        )
      : rawBody;
    chunks.push(body);
  }
  for (const child of node.children) {
    walkNumberedMarkdown(child, depth + 1, chunks, glossaryPaint);
  }
}

export function numberedToMarkdown(
  numbered: NumberedTreeNode[],
  glossaryPaint?: GlossaryExportPaint,
): string {
  const chunks: string[] = [];
  for (const node of numbered) {
    walkNumberedMarkdown(node, 1, chunks, glossaryPaint);
  }
  return `${chunks.join("\n\n").trim()}\n`;
}

export type MountedExportDoc = {
  root: HTMLElement;
  dispose: () => void;
};

/** 离屏挂载导出用 TipTap 文档；调用方负责 dispose。 */
export async function mountExportDocument(
  markdown: string,
  projectTitle: string,
  options?: { hideWatermark?: boolean },
): Promise<MountedExportDoc> {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:0;top:0;width:794px;transform:translateX(-120%);pointer-events:none;opacity:1;z-index:0;";
  document.body.appendChild(host);

  const root: Root = createRoot(host);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    try {
      root.unmount();
    } catch {
      /* ignore */
    }
    host.remove();
  };

  try {
    const el = await new Promise<HTMLElement>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("长图渲染超时")),
        60000,
      );
      root.render(
        createElement(LongPdfDocument, {
          markdown,
          projectTitle,
          hideWatermark:
            options?.hideWatermark ?? getAppSettings().hideExportWatermark,
          onReady: (node) => {
            window.clearTimeout(timeout);
            resolve(node);
          },
        }),
      );
    });
    return { root: el, dispose };
  } catch (err) {
    dispose();
    throw err;
  }
}

const pngFilter = (node: HTMLElement | unknown) => {
  if (!(node instanceof HTMLElement)) return true;
  if (node.tagName === "IMG") {
    const img = node as HTMLImageElement;
    return img.complete && img.naturalWidth > 0;
  }
  return true;
};

/** 截取任意导出 DOM 节点为 PNG data URL。 */
export async function captureElementPng(
  el: HTMLElement,
  options?: { backgroundColor?: string | null; pixelRatio?: number },
): Promise<string> {
  const cssW = Math.max(el.scrollWidth, el.offsetWidth, 1);
  const cssH = Math.max(el.scrollHeight, el.offsetHeight, 1);
  let pixelRatio = options?.pixelRatio ?? 2;
  if (cssW * pixelRatio > MAX_SIDE) {
    pixelRatio = MAX_SIDE / cssW;
  }
  if (cssH * pixelRatio > MAX_SIDE) {
    pixelRatio = Math.min(pixelRatio, MAX_SIDE / cssH);
  }
  pixelRatio = Math.max(1, Math.min(2, pixelRatio));

  try {
    return await toPng(el, {
      pixelRatio,
      cacheBust: false,
      backgroundColor: options?.backgroundColor ?? "#ffffff",
      width: cssW,
      height: cssH,
      style: {
        transform: "none",
        margin: "0",
      },
      filter: pngFilter,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `块截图失败：${msg}。可去掉正文大图后重试，或检查图片是否能正常显示。`,
    );
  }
}

export async function mountAndCapturePng(
  markdown: string,
  projectTitle: string,
): Promise<string> {
  const mounted = await mountExportDocument(markdown, projectTitle);
  try {
    const naturalH = Math.max(
      mounted.root.scrollHeight,
      mounted.root.offsetHeight,
      1,
    );
    let pixelRatio = 2;
    if (CSS_WIDTH * pixelRatio > MAX_SIDE) {
      pixelRatio = MAX_SIDE / CSS_WIDTH;
    }
    if (naturalH * pixelRatio > MAX_SIDE) {
      pixelRatio = Math.min(pixelRatio, MAX_SIDE / naturalH);
    }
    pixelRatio = Math.max(1, Math.min(2, pixelRatio));

    try {
      return await toPng(mounted.root, {
        pixelRatio,
        cacheBust: false,
        backgroundColor: "#ffffff",
        width: CSS_WIDTH,
        height: naturalH,
        style: {
          transform: "none",
          margin: "0",
        },
        filter: pngFilter,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `长图截取失败：${msg}。可去掉正文大图后重试，或检查图片是否能正常显示。`,
      );
    }
  } finally {
    mounted.dispose();
  }
}

export async function renderNumberedToPngBlob(
  numbered: NumberedTreeNode[],
  sheetTitle: string,
  glossaryPaint?: GlossaryExportPaint,
): Promise<Blob> {
  if (!numbered.length) throw new Error("没有可导出的内容");
  const rawMd = numberedToMarkdown(numbered, glossaryPaint);
  const markdown = await rewriteMarkdownForDisplay(rawMd);
  const dataUrl = await mountAndCapturePng(markdown, sheetTitle);
  const res = await fetch(dataUrl);
  return res.blob();
}

export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const m = /^data:image\/png;base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error("无效的 PNG 数据");
  const bin = atob(m[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
