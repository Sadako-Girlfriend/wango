/**
 * 窄窗时计算左树 / 右 Agent 显示宽度，保证中间正文不低于 mainMin。
 * 三栏并排挤不下时改为 overlay（Agent 叠在正文上），不收起左树。
 */

import {
  AGENT_PANE_WIDTH_MIN,
  MAIN_PANE_WIDTH_MIN,
  TREE_PANE_WIDTH_MIN,
} from "@/desktop/appSettings";

export const PANE_SPLIT_SLOT = 14;
export const PANE_BODY_PAD_X = 20;

export function fitSideWidths(params: {
  bodyWidth: number;
  preferTree: number;
  preferAgent: number;
  treeCollapsed: boolean;
  agentWanted: boolean;
  mainMin?: number;
}): {
  tree: number;
  agent: number;
  /** Agent 不占文档流，叠在正文右侧 */
  overlayAgent: boolean;
} {
  const mainMin = params.mainMin ?? MAIN_PANE_WIDTH_MIN;
  let tree = params.treeCollapsed ? 0 : params.preferTree;
  let agent = params.agentWanted ? params.preferAgent : 0;
  let overlayAgent = false;

  if (!params.agentWanted) {
    const budget =
      params.bodyWidth - PANE_BODY_PAD_X - 1 * PANE_SPLIT_SLOT;
    let o = tree + mainMin - budget;
    if (o > 0 && tree > TREE_PANE_WIDTH_MIN) {
      tree = Math.max(TREE_PANE_WIDTH_MIN, tree - o);
    }
    return { tree, agent: 0, overlayAgent: false };
  }

  const splits = 2;
  const budget =
    params.bodyWidth - PANE_BODY_PAD_X - splits * PANE_SPLIT_SLOT;

  const overflow = () => tree + agent + mainMin - budget;
  let o = overflow();
  if (o > 0 && agent > AGENT_PANE_WIDTH_MIN) {
    const cut = Math.min(o, agent - AGENT_PANE_WIDTH_MIN);
    agent -= cut;
    o -= cut;
  }
  if (o > 0 && tree > TREE_PANE_WIDTH_MIN) {
    const cut = Math.min(o, tree - TREE_PANE_WIDTH_MIN);
    tree -= cut;
    o -= cut;
  }

  if (o > 0) {
    // 并排放不下：Agent 叠层，左树按「无 Agent」重算
    overlayAgent = true;
    agent = Math.min(
      params.preferAgent,
      Math.max(
        AGENT_PANE_WIDTH_MIN,
        params.bodyWidth - PANE_BODY_PAD_X - 40,
      ),
    );
    const budgetNoAgent =
      params.bodyWidth - PANE_BODY_PAD_X - 1 * PANE_SPLIT_SLOT;
    tree = params.treeCollapsed ? 0 : params.preferTree;
    o = tree + mainMin - budgetNoAgent;
    if (o > 0 && tree > TREE_PANE_WIDTH_MIN) {
      tree = Math.max(TREE_PANE_WIDTH_MIN, tree - o);
    }
  }

  return { tree, agent, overlayAgent };
}
