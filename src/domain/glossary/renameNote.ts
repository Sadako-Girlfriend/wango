/**
 * 引用记录上的改名备注（纯函数）。
 *
 * - legacy：建链时用的是旧名（含二次、三次改名前留下的）
 * - after：当前名确立之后新建的引用
 */

import type {
  GlossaryLink,
  GlossaryRenameEvent,
} from "../types";

export type GlossaryRenameNoteKind = "legacy" | "after";

export interface GlossaryRenameNote {
  kind: GlossaryRenameNoteKind;
  /** 建链时的用名 */
  origin: string;
  /** 从建链用名到当前名，中间经历了几次改名（≥1） */
  generations: number;
}

/** 由 renameHistory 还原标题时间线：[最初, …, 当前] */
export function titleLineage(
  history: GlossaryRenameEvent[],
  currentTitle: string,
): string[] {
  if (!history.length) return [currentTitle];
  const titles: string[] = [history[0]!.from];
  for (const h of history) {
    if (titles[titles.length - 1] !== h.to) titles.push(h.to);
  }
  if (titles[titles.length - 1] !== currentTitle) {
    titles.push(currentTitle);
  }
  return titles;
}

/**
 * 若词条从未改名 → null。
 * 否则按 originText（缺省回退 matchedText）相对当前标题判 legacy / after。
 */
export function renameNoteForLink(
  link: Pick<GlossaryLink, "matchedText" | "originText">,
  history: GlossaryRenameEvent[] | undefined,
  currentTitle: string,
): GlossaryRenameNote | null {
  const hist = history ?? [];
  if (!hist.length) return null;
  const origin = (link.originText || link.matchedText || "").trim();
  const current = currentTitle.trim();
  if (!origin || !current) return null;

  const lineage = titleLineage(hist, current);
  const originIdx = lineage.indexOf(origin);
  const currentIdx = lineage.length - 1;

  if (origin === current) {
    return {
      kind: "after",
      origin,
      generations: Math.max(1, hist.length),
    };
  }

  // 旧名不在时间线里（手改 aliases 等）：仍标已改名，代数按总改名次数
  if (originIdx < 0) {
    return {
      kind: "legacy",
      origin,
      generations: Math.max(1, hist.length),
    };
  }

  return {
    kind: "legacy",
    origin,
    generations: Math.max(1, currentIdx - originIdx),
  };
}
