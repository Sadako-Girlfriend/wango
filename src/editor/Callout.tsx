/**
 * 备注块（callout）：黄底提示；存盘为 HTML aside。
 * 左侧灯泡为装饰（不可选中删除）；整块可用 × 或工具栏取消。
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useI18n } from "@/i18n/useI18n";
import styles from "./Callout.module.css";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      toggleCallout: () => ReturnType;
    };
  }
}

function CalloutView({ deleteNode }: NodeViewProps) {
  const { t } = useI18n();

  return (
    <NodeViewWrapper
      as="aside"
      className={styles.callout}
      data-type="callout"
      data-wg-callout="1"
    >
      <span className={styles.icon} contentEditable={false} aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M9 18h6M10 21h4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M12 3a6 6 0 0 0-3.5 10.8c.6.45 1 1.1 1.1 1.85V17h4.8v-1.35c.1-.75.5-1.4 1.1-1.85A6 6 0 0 0 12 3Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <NodeViewContent className={styles.body} />
      <button
        type="button"
        className={styles.remove}
        contentEditable={false}
        aria-label={t("editor.calloutRemove")}
        title={t("editor.calloutRemove")}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          deleteNode();
        }}
      >
        ×
      </button>
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  // false：光标进出更自然，整块可用 Backspace / × 删除
  isolating: false,

  parseHTML() {
    return [{ tag: 'aside[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "aside",
      mergeAttributes(HTMLAttributes, {
        "data-type": "callout",
        class: "wg-callout",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      toggleCallout:
        () =>
        ({ commands, editor }) => {
          if (editor.isActive("callout")) {
            return commands.lift("callout");
          }
          return commands.wrapIn("callout");
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-m": () => this.editor.commands.toggleCallout(),
      // 备注末尾空段再按 Enter → 跳出到下方正文
      Enter: () => {
        const { empty, $from } = this.editor.state.selection;
        if (!empty || !this.editor.isActive("callout")) return false;
        for (let d = $from.depth; d > 0; d--) {
          const n = $from.node(d);
          if (n.type.name !== "callout") continue;
          const lastEmpty =
            $from.index(d) === n.childCount - 1 &&
            n.childCount >= 2 &&
            $from.parent.type.name === "paragraph" &&
            $from.parent.content.size === 0;
          if (!lastEmpty) break;
          return this.editor.commands.command(({ tr, dispatch, state }) => {
            const from = $from.before($from.depth);
            const to = $from.after($from.depth);
            const after = $from.after(d) - (to - from);
            tr.delete(from, to);
            tr.insert(after, state.schema.nodes.paragraph.create());
            tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)));
            if (dispatch) dispatch(tr);
            return true;
          });
        }
        return false;
      },
      Backspace: () => {
        const { empty, $anchor } = this.editor.state.selection;
        if (!empty || !this.editor.isActive("callout")) return false;
        for (let d = $anchor.depth; d > 0; d--) {
          const n = $anchor.node(d);
          if (n.type.name !== "callout") continue;
          const onlyEmpty =
            n.childCount === 1 &&
            n.firstChild?.type.name === "paragraph" &&
            n.firstChild.content.size === 0;
          const atStart =
            $anchor.parentOffset === 0 && $anchor.index(d) === 0;
          if (onlyEmpty || (atStart && n.textContent.trim() === "")) {
            return this.editor.commands.command(({ tr, dispatch }) => {
              const pos = $anchor.before(d);
              if (dispatch) tr.delete(pos, pos + n.nodeSize);
              return true;
            });
          }
          break;
        }
        return false;
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView, {
      className: "node-callout",
      contentDOMElementTag: "div",
    });
  },
});
