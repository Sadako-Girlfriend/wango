/**
 * AI 改动提示：新增 / 删除块（对应 data-wg-diff）。
 */

import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import styles from "./DiffBlocks.module.css";

function DiffAddView({ deleteNode: _deleteNode }: NodeViewProps) {
  return (
    <NodeViewWrapper
      as="div"
      className={styles.add}
      data-wg-diff="add"
      data-type="diff-add"
    >
      <NodeViewContent className={styles.body} />
    </NodeViewWrapper>
  );
}

function DiffDelView({ deleteNode }: NodeViewProps) {
  return (
    <NodeViewWrapper
      as="div"
      className={styles.del}
      data-wg-diff="del"
      data-type="diff-del"
    >
      <NodeViewContent className={styles.body} />
      <button
        type="button"
        className={styles.dismiss}
        contentEditable={false}
        title="移除删除段"
        aria-label="移除删除段"
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

export const DiffAdd = Node.create({
  name: "diffAdd",
  group: "block",
  content: "block+",
  defining: true,
  isolating: false,

  parseHTML() {
    return [
      { tag: 'div[data-wg-diff="add"]' },
      { tag: 'ins[data-wg-diff="add"]' },
      { tag: 'ins[data-type="diff-add"]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-wg-diff": "add",
        "data-type": "diff-add",
        class: "wg-diff-add",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DiffAddView);
  },
});

export const DiffDel = Node.create({
  name: "diffDel",
  group: "block",
  content: "block+",
  defining: true,
  isolating: false,

  parseHTML() {
    return [
      { tag: 'div[data-wg-diff="del"]' },
      { tag: 'del[data-wg-diff="del"]' },
      { tag: 'del[data-type="diff-del"]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-wg-diff": "del",
        "data-type": "diff-del",
        class: "wg-diff-del",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DiffDelView);
  },
});
