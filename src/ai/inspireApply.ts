/**
 * 将 inspire 协议事件应用到指定 tab（模型 id → 真实 uuid）。
 * delta 立即追加（打字机由上游 typewriterPace 控制），不再按帧合并成大段。
 */

import { createId, createNode } from "@/domain";
import { useSessionStore } from "@/store/sessionStore";
import {
  enforceSingleCallout,
  type InspireEvent,
} from "./inspireProtocol";

export class InspireSessionApplier {
  private readonly idMap = new Map<string, string>();

  constructor(private readonly tabId: string) {}

  apply(ev: InspireEvent): void {
    const store = useSessionStore.getState();
    switch (ev.type) {
      case "project": {
        const name = ev.name.trim();
        if (name) store.renameTabProject(this.tabId, name);
        break;
      }
      case "node": {
        const realId = createId();
        this.idMap.set(ev.id, realId);
        let parentReal: string | null = null;
        if (ev.parentId) {
          parentReal = this.idMap.get(ev.parentId) ?? null;
        }
        store.addInspireNode(this.tabId, {
          node: createNode({
            id: realId,
            title: ev.title,
            content: "",
            ...(ev.priority ? { priority: ev.priority } : {}),
          }),
          parentId: parentReal,
          select: true,
        });
        break;
      }
      case "delta": {
        const realId = this.idMap.get(ev.id);
        if (!realId || !ev.text) break;
        store.selectNodeOnTab(this.tabId, realId);
        store.appendContentOnTab(this.tabId, realId, ev.text);
        break;
      }
      case "error":
        throw new Error(ev.message || "Inspire error");
      case "done":
        this.finalize();
        break;
      default:
        break;
    }
  }

  dispose(): void {
    /* no-op：delta 已同步写入 */
  }

  private finalize(): void {
    const tab = useSessionStore.getState().tabs.find((t) => t.id === this.tabId);
    if (!tab) return;
    const walk = (
      nodes: typeof tab.project.tree,
    ): typeof tab.project.tree =>
      nodes.map((n) => ({
        ...n,
        content: enforceSingleCallout(n.content),
        children: walk(n.children),
      }));
    const tree = walk(tab.project.tree);
    useSessionStore.setState((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== this.tabId) return t;
        return {
          ...t,
          project: { ...t.project, tree },
          revision: t.revision + 1,
          touched: true,
        };
      }),
    }));
  }
}
