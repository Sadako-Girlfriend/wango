/**
 * 仅导出用：保留正文里的词表引用 span（class + 可选 style）。
 */

import { Mark, mergeAttributes } from "@tiptap/core";

export const GlossaryExportMark = Mark.create({
  name: "glossaryExportLink",
  inclusive: false,
  excludes: "",

  parseHTML() {
    return [{ tag: "span.wg-glossary-link" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "wg-glossary-link" }),
      0,
    ];
  },

  addAttributes() {
    return {
      style: {
        default: null,
        parseHTML: (el) => el.getAttribute("style"),
        renderHTML: (attrs) =>
          attrs.style ? { style: attrs.style as string } : {},
      },
    };
  },
});
