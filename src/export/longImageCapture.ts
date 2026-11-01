/**
 * 离屏 TipTap → PNG data URL：长图 PDF / 内容图片共用。
 */

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toPng } from "html-to-image";
import type { NumberedTreeNode } from "@/domain";
import { getAppSettings } from "@/desktop/appSettings";
import { rewriteMarkdownForDisplay } from "@/desktop/mediaUrl";
import { LongPdfDocument } from "./LongPdfDocument";

const MAX_SIDE = 12000;
const CSS_WIDTH = 794;

export function walkNumberedMarkdown(
  node: NumberedTreeNode,
  depth: number,
  chunks: string[],
) {
  const level = Math.min(Math.max(depth, 1), 6);
  const hashes = "#".repeat(level);
  chunks.push(`${hashes} ${node.number} ${node.title}`);
  const body = node.content.trim();
  if (body) chunks.push(body);
  for (const child of node.children) {
    walkNumberedMarkdown(child, depth + 1, chunks);
  }
}

export function numberedToMarkdown(numbered: NumberedTreeNode[]): string {
  const chunks: string[] = [];
  for (const node of numbered) {
    walkNumberedMarkdown(node, 1, chunks);
  }
  return `${chunks.join("\n\n").trim()}\n`;
}

export async function mountAndCapturePng(
  markdown: string,
  projectTitle: string,
): Promise<string> {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:0;top:0;width:794px;transform:translateX(-120%);pointer-events:none;opacity:1;z-index:0;";
  document.body.appendChild(host);

  const root: Root = createRoot(host);
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
          hideWatermark: getAppSettings().hideExportWatermark,
          onReady: (node) => {
            window.clearTimeout(timeout);
            resolve(node);
          },
        }),
      );
    });

    const naturalH = Math.max(el.scrollHeight, el.offsetHeight, 1);
    let pixelRatio = 2;
    if (CSS_WIDTH * pixelRatio > MAX_SIDE) {
      pixelRatio = MAX_SIDE / CSS_WIDTH;
    }
    if (naturalH * pixelRatio > MAX_SIDE) {
      pixelRatio = Math.min(pixelRatio, MAX_SIDE / naturalH);
    }
    pixelRatio = Math.max(1, Math.min(2, pixelRatio));

    try {
      return await toPng(el, {
        pixelRatio,
        cacheBust: false,
        backgroundColor: "#ffffff",
        width: CSS_WIDTH,
        height: naturalH,
        style: {
          transform: "none",
          margin: "0",
        },
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true;
          if (node.tagName === "IMG") {
            const img = node as HTMLImageElement;
            return img.complete && img.naturalWidth > 0;
          }
          return true;
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `长图截取失败：${msg}。可去掉正文大图后重试，或检查图片是否能正常显示。`,
      );
    }
  } finally {
    try {
      root.unmount();
    } catch {
      /* ignore */
    }
    host.remove();
  }
}

export async function renderNumberedToPngBlob(
  numbered: NumberedTreeNode[],
  sheetTitle: string,
): Promise<Blob> {
  if (!numbered.length) throw new Error("没有可导出的内容");
  const rawMd = numberedToMarkdown(numbered);
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
