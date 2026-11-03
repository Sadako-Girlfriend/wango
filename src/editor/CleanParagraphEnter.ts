/**
 * 回车拆段时清掉字号/颜色等展示性 mark，避免空行继承粘贴残留的大字号被撑高。
 */

import { Extension } from "@tiptap/core";

export const CleanParagraphEnter = Extension.create({
  name: "cleanParagraphEnter",

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const editor = this.editor;
        const { $from } = editor.state.selection;
        const parent = $from.parent;
        // 列表 / 代码块 / 引用块交给默认或其它扩展
        if (
          parent.type.name === "codeBlock" ||
          parent.type.name === "listItem" ||
          parent.type.name === "callout"
        ) {
          return false;
        }

        const split = editor.commands.splitBlock({ keepMarks: true });
        if (!split) return false;

        // 只清字号/颜色/字体/高亮：空行继承大字号会被撑得很高；粗斜体可继续
        editor
          .chain()
          .unsetMark("textStyle")
          .unsetMark("highlight")
          .run();
        return true;
      },
    };
  },
});
