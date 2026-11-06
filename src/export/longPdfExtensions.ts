/**
 * 长图 PDF 用 TipTap 扩展：与编辑器尽量同构，只读、无占位符。
 */

import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { Markdown } from "tiptap-markdown";
import { Callout } from "@/editor/Callout";
import { FancyCodeBlock } from "@/editor/FancyCodeBlock";
import { FontSize } from "@/editor/FontSize";
import { MathBlock, MathInline } from "@/editor/MathBlock";
import { ResizableImage } from "@/editor/ResizableImage";
import { GlossaryExportMark } from "./GlossaryExportMarkExt";

export function createLongPdfExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      codeBlock: false,
    }),
    FancyCodeBlock,
    Underline,
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    Highlight.configure({ multicolor: true }),
    GlossaryExportMark,
    Callout,
    MathBlock,
    MathInline,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    ResizableImage.configure({ allowBase64: true }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { class: "wg-link" },
    }),
    Markdown.configure({
      html: true,
      transformPastedText: false,
      transformCopiedText: false,
    }),
  ];
}
