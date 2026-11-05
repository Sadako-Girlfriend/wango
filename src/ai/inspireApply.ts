/**
 * 将 inspire 协议事件应用到指定 tab（模型 id → 真实 uuid）。
 * delta 立即追加（打字机由上游 typewriterPace 控制），不再按帧合并成大段。
 */

import { createId, createNode } from "@/domain";
import { useSessionStore } from "@/store/sessionStore";
import { normalizeInspireTree } from "./inspireNormalize";
import {
  enforceSingleCallout,
  type InspireEvent,
} from "./inspireProtocol";

export type InspireApplyOptions = {
  /**
   * 流式根节点挂到此父节点下（合并进当前树）。
   * 未设则与原先一致：parentId 缺失时挂到 tab 根级。
   */
  mountParentId?: string | null;
  /** 为 true 时忽略 project 改名（粘贴导入不改当前项目名） */
  skipProjectRename?: boolean;
};

export class InspireSessionApplier {
  private readonly idMap = new Map<string, string>();
  private readonly mountParentId: string | null | undefined;
  private readonly skipProjectRename: boolean;

  constructor(
    private readonly tabId: string,
    options?: InspireApplyOptions,
  ) {
    this.mountParentId = options?.mountParentId;
    this.skipProjectRename = Boolean(options?.skipProjectRename);
  }

  apply(ev: InspireEvent): void {
    const store = useSessionStore.getState();
    switch (ev.type) {
      case "project": {
        if (this.skipProjectRename) break;
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
        } else if (this.mountParentId !== undefined) {
          parentReal = this.mountParentId;
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
      case "reasoning":
        // 仅 UI 展示，不写入树
        break;
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
    // 流式结束后规范化：拆 ## 小节、抬升误挂在「总览」下的章节、去标题手写序号
    const tree = normalizeInspireTree(walk(tab.project.tree));
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
