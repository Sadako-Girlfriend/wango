/**
 * 导出无缝长图 PDF：单页、高度随内容，无 A4 分页留白。
 */

import { jsPDF } from "jspdf";
import type { ProjectData } from "@/domain";
import {
  collectGlossaryColors,
  findNodeById,
  getNumberById,
  withNumbering,
  withNumberingFrom,
  type NumberedTreeNode,
} from "@/domain";
import {
  mountAndCapturePng,
  numberedToMarkdown,
  type GlossaryExportPaint,
} from "./longImageCapture";
import { rewriteMarkdownForDisplay } from "@/desktop/mediaUrl";

export type LongPdfScope = "project" | "node";
/** 导子树时的编号：从头排 / 保留整树源序号 */
export type LongPdfNumbering = "restart" | "preserve";

export interface LongPdfOptions {
  scope: LongPdfScope;
  /** scope=node 时必填 */
  nodeId?: string | null;
  /** 仅 scope=node 有效；默认 restart */
  numbering?: LongPdfNumbering;
  /**
   * 为 true 时不画词表引用高亮（勾选「不显示词表引用」）。
   * 默认 false：PDF 带引用色，贴近编辑器。
   */
  hideGlossaryStyles?: boolean;
}

function glossaryPaintOf(
  project: ProjectData,
  hide?: boolean,
): GlossaryExportPaint | undefined {
  if (hide) return undefined;
  const links = project.glossaryLinks ?? [];
  if (!links.length) return undefined;
  return {
    links,
    colors: collectGlossaryColors(project.glossary ?? []),
  };
}

function resolveExport(
  project: ProjectData,
  options: LongPdfOptions,
): { numbered: NumberedTreeNode[]; title: string } {
  if (options.scope === "node") {
    const id = options.nodeId;
    if (!id) throw new Error("未选中节点，无法导出当前节点 PDF");
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

function pngDataUrlToPdf(dataUrl: string): Blob {
  const probe = new jsPDF({ unit: "pt", format: [10, 10] });
  const props = probe.getImageProperties(dataUrl);
  const ptW = (props.width * 72) / 96;
  const ptH = (props.height * 72) / 96;

  const MAX_PT = 14400;
  let pageW = ptW;
  let pageH = ptH;
  if (pageH > MAX_PT || pageW > MAX_PT) {
    const s = Math.min(MAX_PT / pageW, MAX_PT / pageH);
    pageW *= s;
    pageH *= s;
  }

  const pdf = new jsPDF({
    orientation: pageW >= pageH ? "landscape" : "portrait",
    unit: "pt",
    format: [pageW, pageH],
    compress: true,
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, pageW, pageH, undefined, "FAST");
  return pdf.output("blob");
}

/** 将项目（或当前节点子树）导出为无缝长图 PDF */
export async function toLongPdf(
  project: ProjectData,
  options: LongPdfOptions,
): Promise<Blob> {
  const { numbered, title } = resolveExport(project, options);
  if (!numbered.length) throw new Error("没有可导出的内容");

  const rawMd = numberedToMarkdown(
    numbered,
    glossaryPaintOf(project, options.hideGlossaryStyles),
  );
  const markdown = await rewriteMarkdownForDisplay(rawMd);
  const dataUrl = await mountAndCapturePng(markdown, title);
  return pngDataUrlToPdf(dataUrl);
}
