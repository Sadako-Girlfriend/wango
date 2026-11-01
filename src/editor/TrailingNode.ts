/**
 * 文档末尾若是代码块 / 备注 / 图片等，自动补一个空段落，否则下方无法落光标打字。
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const TrailingNode = Extension.create({
  name: "trailingNode",

  addOptions() {
    return {
      node: "paragraph",
      /** 这些节点已可直接打字，不必再在末尾追加 */
      notAfter: ["paragraph"] as string[],
    };
  },

  addProseMirrorPlugins() {
    const { node: nodeName, notAfter } = this.options;

    const plugin = new Plugin({
      key: new PluginKey("trailingNode"),
      appendTransaction: (_transactions, _oldState, state) => {
        const { doc, tr, schema } = state;
        const type = schema.nodes[nodeName];
        if (!type) return null;

        const last = doc.lastChild;
        if (!last || notAfter.includes(last.type.name)) return null;

        return tr.insert(doc.content.size, type.create());
      },
    });

    return [plugin];
  },
});
