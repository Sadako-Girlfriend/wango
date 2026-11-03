/**
 * 可拖拽非模态词条审计日志面板。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  countActiveLinks,
  findGlossaryById,
  findNodeById,
  getNumberById,
  isAutoLink,
  linkSourceOf,
  renameNoteForLink,
  resolveGlossaryContent,
  resolveGlossaryTitle,
  snippetAround,
  type GlossaryLink,
  type GlossaryLinkStatus,
  type GlossaryLog,
  type GlossaryLogKind,
  type GlossaryNode,
  type GlossaryRenameNote,
  type ProjectData,
  type TreeNode,
} from "@/domain";
import { useI18n } from "@/i18n/useI18n";
import styles from "./GlossaryLogPanel.module.css";

type StatusFilter =
  | "all"
  | "active"
  | "removed"
  | "modified"
  | "revoked"
  | "blocked"
  | "yielded";

/** 审查视角：已手动绑定 / 自动疑似 / 失效 */
type AuditSourceFilter = "manual" | "auto" | "broken" | "all";

/** 引用记录一行 = 一处正文绑定的「当前状态」，不是每条历史事件一张卡 */
type RefDisplayRow = {
  key: string;
  link: GlossaryLink;
  /** 展示用文案/原句：取该 link 最新一条日志 */
  latestLog: GlossaryLog;
  liveStatus: GlossaryLinkStatus;
};

interface GlossaryLogPanelProps {
  project: ProjectData;
  entryId: string;
  logKind: GlossaryLogKind;
  onClose: () => void;
  onJump: (hostNodeId: string) => void;
  onRemoveLink: (linkId: string) => void;
  onRestoreLink: (linkId: string) => void;
  onClearBlacklist: (linkId: string) => void;
  /** 疑似提及 → 手动绑定 */
  onConfirmAuto?: (linkId: string) => void;
  onUndoEdit: (logId: string) => void;
}

export function GlossaryLogPanel({
  project,
  entryId,
  logKind,
  onClose,
  onJump,
  onRemoveLink,
  onRestoreLink,
  onClearBlacklist,
  onConfirmAuto,
  onUndoEdit,
}: GlossaryLogPanelProps) {
  const { t } = useI18n();
  const [pos, setPos] = useState({ x: 80, y: 80 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const [query, setQuery] = useState("");
  // 引用记录默认只看「有效」，避免让位后的历史「自动引用」冒充还活着
  const [filter, setFilter] = useState<StatusFilter>(
    logKind === "ref" ? "active" : "all",
  );
  // 默认看疑似，方便一键确认
  const [auditSource, setAuditSource] = useState<AuditSourceFilter>("auto");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const entry = findGlossaryById(project.glossary, entryId);
  const title = entry
    ? resolveGlossaryTitle(entry, project.tree)
    : entryId;

  const matchesQueryDate = (log: GlossaryLog) => {
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const blob = `${log.message} ${log.before ?? ""} ${log.after ?? ""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    if (from && log.at.slice(0, 10) < from) return false;
    if (to && log.at.slice(0, 10) > to) return false;
    return true;
  };

  /**
   * 引用记录：按 glossaryLinks 去重（一处正文一张卡），状态以 link 实时值为准。
   * 这样「先自动引用、后冲突让位」不会并排出两张互相矛盾的卡。
   */
  const refRows = useMemo((): RefDisplayRow[] => {
    if (logKind !== "ref") return [];
    const entryLogs = project.glossaryLogs.filter(
      (l) => l.entryId === entryId && l.kind === "ref",
    );
    const rows: RefDisplayRow[] = [];
    for (const link of project.glossaryLinks) {
      if (link.entryId !== entryId) continue;
      if (logKind === "ref") {
        const src = linkSourceOf(link);
        if (auditSource === "manual" && src !== "manual") continue;
        if (auditSource === "auto" && src !== "auto") continue;
        if (auditSource === "broken") {
          if (
            !(
              src === "manual" &&
              (link.status === "modified" ||
                link.status === "removed" ||
                link.status === "revoked")
            )
          ) {
            continue;
          }
        }
      }
      if (filter !== "all" && link.status !== filter) continue;
      const related = entryLogs
        .filter((l) => l.linkId === link.id)
        .sort((a, b) => (a.at < b.at ? 1 : -1));
      const latestLog: GlossaryLog =
        related[0] ??
        ({
          id: `synth-${link.id}`,
          entryId,
          kind: "ref",
          status: link.status,
          hostNodeId: link.hostNodeId,
          before: "",
          message:
            link.status === "yielded"
              ? "因区间冲突自动让位"
              : link.status === "active"
                ? "自动引用"
                : String(link.status),
          at: link.updatedAt,
          linkId: link.id,
        } satisfies GlossaryLog);
      const q = query.trim().toLowerCase();
      if (q) {
        const blob =
          `${latestLog.message} ${latestLog.before ?? ""} ${link.matchedText}`.toLowerCase();
        if (!blob.includes(q)) continue;
      }
      if (from && latestLog.at.slice(0, 10) < from) continue;
      if (to && latestLog.at.slice(0, 10) > to) continue;
      rows.push({
        key: link.id,
        link,
        latestLog,
        liveStatus: link.status,
      });
    }
    rows.sort((a, b) =>
      a.link.updatedAt < b.link.updatedAt ? 1 : -1,
    );
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matchesQueryDate 闭包用 query/from/to
  }, [
    project.glossaryLinks,
    project.glossaryLogs,
    entryId,
    logKind,
    filter,
    auditSource,
    query,
    from,
    to,
  ]);

  /** 修改记录：只展示同步替换正文等审计；词表标题改名（未同步）不记也不展示 */
  const editLogs = useMemo(() => {
    if (logKind !== "edit") return [];
    return project.glossaryLogs.filter((l) => {
      if (l.entryId !== entryId || l.kind !== "edit") return false;
      if (l.status === "rename" || /未同步正文/.test(l.message)) return false;
      if (filter !== "all" && l.status !== filter) return false;
      return matchesQueryDate(l);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.glossaryLogs, entryId, logKind, filter, query, from, to]);

  const activeCount = countActiveLinks(project.glossaryLinks, entryId);
  const listEmpty =
    logKind === "ref" ? refRows.length === 0 : editLogs.length === 0;

  const onHeadDown = (e: React.PointerEvent) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onHeadMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPos({
      x: Math.max(8, e.clientX - dragRef.current.dx),
      y: Math.max(8, e.clientY - dragRef.current.dy),
    });
  };
  const onHeadUp = () => {
    dragRef.current = null;
  };

  const exportCsv = () => {
    const lines =
      logKind === "ref"
        ? refRows.map((r) =>
            [
              r.latestLog.at,
              r.liveStatus,
              r.link.hostNodeId,
              csvEscape(
                r.liveStatus === "yielded"
                  ? "因区间冲突自动让位（此处已解绑）"
                  : r.latestLog.message,
              ),
              csvEscape(r.latestLog.before ?? ""),
              "",
            ].join(","),
          )
        : editLogs.map((l) =>
            [
              l.at,
              l.status,
              l.hostNodeId ?? "",
              csvEscape(l.message),
              csvEscape(l.before ?? ""),
              csvEscape(l.after ?? ""),
            ].join(","),
          );
    const rows = [
      ["at", "status", "host", "message", "before", "after"].join(","),
      ...lines,
    ];
    const blob = new Blob(["\uFEFF" + rows.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `glossary-${entryId}-${logKind}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 引用审查：状态下钻；修改记录：已修改 / 已撤销
  const chips: Array<[StatusFilter, string]> =
    logKind === "ref"
      ? [
          ["all", t("glossary.logFilterAll")],
          ["active", t("glossary.logFilterActive")],
          ["removed", t("glossary.logFilterRemoved")],
          ["blocked", t("glossary.logFilterBlocked")],
          ["yielded", t("glossary.logFilterYielded")],
          ["modified", t("glossary.logFilterModified")],
        ]
      : [
          ["all", t("glossary.logFilterAll")],
          ["modified", t("glossary.logFilterModified")],
          ["revoked", t("glossary.logFilterRevoked")],
        ];

  const auditChips: Array<[AuditSourceFilter, string]> = [
    ["manual", t("glossary.auditManual")],
    ["auto", t("glossary.auditAuto")],
    ["broken", t("glossary.auditBroken")],
    ["all", t("glossary.auditAll")],
  ];

  useEffect(() => {
    if (!chips.some(([key]) => key === filter)) {
      setFilter(logKind === "ref" ? "all" : "all");
    }
  }, [chips, filter, logKind]);

  return createPortal(
    <div
      className={styles.panel}
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label={t("glossary.auditTitle")}
    >
      <div
        className={styles.head}
        onPointerDown={onHeadDown}
        onPointerMove={onHeadMove}
        onPointerUp={onHeadUp}
      >
        <h2 className={styles.headTitle}>
          {logKind === "ref"
            ? t("glossary.auditTitle")
            : t("glossary.logTitle")}{" "}
          · {title}
        </h2>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label={t("glossary.logClose")}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("glossary.logSearch")}
        />
        {logKind === "ref" ? (
          <div className={styles.filters}>
            {auditChips.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={styles.chip}
                data-active={auditSource === key || undefined}
                onClick={() => {
                  setAuditSource(key);
                  setFilter(key === "broken" ? "all" : "active");
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <div className={styles.filters}>
          {chips.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={styles.chip}
              data-active={filter === key || undefined}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {logKind === "ref" ? (
          <p className={styles.hint}>{t("glossary.auditHint")}</p>
        ) : null}
        <div className={styles.dates}>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label={t("glossary.logDateFrom")}
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label={t("glossary.logDateTo")}
          />
        </div>
      </div>
      <div className={styles.list}>
        {listEmpty ? (
          <div className={styles.empty}>
            {logKind === "ref" && filter === "active"
              ? t("glossary.logEmptyActive")
              : t("glossary.logEmpty")}
          </div>
        ) : logKind === "ref" ? (
          refRows.map((row) => (
            <LogCard
              key={row.key}
              log={row.latestLog}
              liveStatus={row.liveStatus}
              link={row.link}
              tree={project.tree}
              glossary={project.glossary}
              links={project.glossaryLinks}
              onJump={onJump}
              onRemoveLink={onRemoveLink}
              onRestoreLink={onRestoreLink}
              onClearBlacklist={onClearBlacklist}
              onConfirmAuto={onConfirmAuto}
              onUndoEdit={onUndoEdit}
            />
          ))
        ) : (
          editLogs.map((log) => (
            <LogCard
              key={log.id}
              log={log}
              liveStatus={log.status === "rename" ? "modified" : log.status}
              tree={project.tree}
              glossary={project.glossary}
              links={project.glossaryLinks}
              onJump={onJump}
              onRemoveLink={onRemoveLink}
              onRestoreLink={onRestoreLink}
              onClearBlacklist={onClearBlacklist}
              onUndoEdit={onUndoEdit}
            />
          ))
        )}
      </div>
      <div className={styles.foot}>
        <span>{t("glossary.logCount", { count: String(activeCount) })}</span>
        <button type="button" className={styles.exportBtn} onClick={exportCsv}>
          {t("glossary.logExportCsv")}
        </button>
      </div>
    </div>,
    document.body,
  );
}

function LogCard({
  log,
  liveStatus,
  link,
  tree,
  glossary,
  links,
  onJump,
  onRemoveLink,
  onRestoreLink,
  onClearBlacklist,
  onConfirmAuto,
  onUndoEdit,
}: {
  log: GlossaryLog;
  /** 以 link 实时状态为准；历史日志里的 status 可能已过期 */
  liveStatus: GlossaryLinkStatus | GlossaryLog["status"];
  /** 引用记录行带上实时 link，用于改名备注 */
  link?: GlossaryLink;
  tree: TreeNode[];
  glossary: GlossaryNode[];
  links: GlossaryLink[];
  onJump: (hostNodeId: string) => void;
  onRemoveLink: (linkId: string) => void;
  onRestoreLink: (linkId: string) => void;
  onClearBlacklist: (linkId: string) => void;
  onConfirmAuto?: (linkId: string) => void;
  onUndoEdit: (logId: string) => void;
}) {
  const { t } = useI18n();
  const hostLabel = log.hostNodeId
    ? formatHostLabel(tree, glossary, log.hostNodeId)
    : "";

  // 引用日志：正文区展示原句；旧日志缺 before 时按 link 区间从正文现场补
  const sentence =
    log.kind === "ref"
      ? log.before || resolveRefSentence(log, tree, glossary, links)
      : null;

  // 有效引用旁：旧名留下的 / 改名后新建的（含二次、三次）
  const renameNote =
    log.kind === "ref" && liveStatus === "active" && link
      ? (() => {
          const entry = findGlossaryById(glossary, link.entryId);
          if (!entry) return null;
          return renameNoteForLink(
            link,
            entry.renameHistory,
            resolveGlossaryTitle(entry, tree),
          );
        })()
      : null;

  // 修改日志：同步替换有句段 Diff；未同步改名用标题 before/after（旧日志从 message 回填）
  const renamePair =
    log.kind === "edit" ? parseRenamePair(log.message) : null;
  const editBefore = log.kind === "edit" ? log.before || renamePair?.before : null;
  const editAfter = log.kind === "edit" ? log.after || renamePair?.after : null;
  const showEditDiff = Boolean(editBefore && editAfter);
  const snippetText =
    !showEditDiff && log.kind !== "edit"
      ? sentence || log.before || log.after || ""
      : !showEditDiff
        ? log.before || log.after || ""
        : "";

  // 让位 / 移除 / 撤销 / 拦截：视觉上标成「已失效」，与有效引用区分
  const inactive =
    liveStatus === "yielded" ||
    liveStatus === "removed" ||
    liveStatus === "revoked" ||
    liveStatus === "blocked";

  const statusForUi: GlossaryLog["status"] =
    liveStatus === "rename" ? "modified" : liveStatus;

  // 失效时底部说明用「当前结局」，避免仍写着过期的「自动引用」
  const footMessage =
    liveStatus === "yielded"
      ? "因区间冲突自动让位（此处已解绑）"
      : liveStatus === "removed"
        ? log.message || "已移除"
        : liveStatus === "blocked"
          ? log.message || "自动拦截"
          : log.message;

  // 仅「同步替换」带 linkId 才能撤销正文；纯改名无正文变更，不显示空撤销
  const canUndoEdit =
    log.kind === "edit" &&
    (liveStatus === "modified" || liveStatus === "rename") &&
    Boolean(log.linkId);

  return (
    <div
      className={styles.card}
      data-status={statusForUi}
      data-inactive={inactive || undefined}
    >
      <div className={styles.cardHead}>
        <div className={styles.headLeft}>
          {log.hostNodeId ? (
            <button
              type="button"
              className={styles.jump}
              onClick={() => onJump(log.hostNodeId!)}
            >
              {hostLabel || t("glossary.logJump")}
            </button>
          ) : (
            <span />
          )}
          <span className={styles.statusBadge}>
            {statusBadgeLabel(statusForUi, t)}
          </span>
          {renameNote ? (
            <span
              className={styles.renameNote}
              data-kind={renameNote.kind}
              title={renameNoteHint(renameNote, t)}
            >
              {renameNoteLabel(renameNote, t)}
            </span>
          ) : null}
        </div>
      </div>
      {showEditDiff || snippetText ? (
        <div className={styles.snippet}>
          {showEditDiff ? (
            <DiffSnippet before={editBefore!} after={editAfter!} />
          ) : (
            snippetText
          )}
        </div>
      ) : null}
      <div className={styles.meta}>
        <span>
          {formatTime(log.at)} · {footMessage}
        </span>
        {liveStatus === "active" &&
        link &&
        isAutoLink(link) &&
        onConfirmAuto &&
        log.linkId ? (
          <button
            type="button"
            className={styles.action}
            onClick={() => onConfirmAuto(log.linkId!)}
          >
            [{t("glossary.logConfirmBind")}]
          </button>
        ) : null}
        {liveStatus === "active" &&
        link &&
        !isAutoLink(link) &&
        log.linkId ? (
          <button
            type="button"
            className={styles.action}
            onClick={() => onRemoveLink(log.linkId!)}
          >
            [{t("glossary.logRemoveLink")}]
          </button>
        ) : null}
        {(liveStatus === "removed" || liveStatus === "revoked") &&
        log.linkId ? (
          <button
            type="button"
            className={styles.action}
            onClick={() => onRestoreLink(log.linkId!)}
          >
            [{t("glossary.logRestoreLink")}]
          </button>
        ) : null}
        {liveStatus === "blocked" && log.linkId ? (
          <button
            type="button"
            className={styles.action}
            onClick={() => onClearBlacklist(log.linkId!)}
          >
            [{t("glossary.logClearBlacklist")}]
          </button>
        ) : null}
        {canUndoEdit ? (
          <button
            type="button"
            className={styles.action}
            onClick={() => onUndoEdit(log.id)}
          >
            [{t("glossary.logUndo")}]
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** 旧日志无 before 时：用 link 偏移从当前正文回填原句 */
function resolveRefSentence(
  log: GlossaryLog,
  tree: TreeNode[],
  glossary: GlossaryNode[],
  links: GlossaryLink[],
): string {
  if (!log.linkId || !log.hostNodeId) return "";
  const link = links.find((l) => l.id === log.linkId);
  if (!link) return "";
  const hostTree = findNodeById(tree, log.hostNodeId);
  if (hostTree) {
    return snippetAround(hostTree.content, link.start, link.end);
  }
  const hostGloss = findGlossaryById(glossary, log.hostNodeId);
  if (hostGloss) {
    return snippetAround(
      resolveGlossaryContent(hostGloss, tree),
      link.start,
      link.end,
    );
  }
  return link.matchedText;
}

/** 从「改名／同步替换「旧」→「新」」类 message 解析标题对，补旧日志缺 before/after */
function parseRenamePair(
  message: string,
): { before: string; after: string } | null {
  const m = /「(.+?)」\s*→\s*「(.+?)」/.exec(message);
  if (!m?.[1] || !m[2]) return null;
  return { before: m[1], after: m[2] };
}

function DiffSnippet({ before, after }: { before: string; after: string }) {
  // 简易：在 after 中标红相对 before 多出的最长公共后缀/前缀差异中段
  const prefix = commonPrefixLen(before, after);
  const suffix = commonSuffixLen(before.slice(prefix), after.slice(prefix));
  const midStart = prefix;
  const midEnd = after.length - suffix;
  const mid = after.slice(midStart, midEnd);
  return (
    <>
      {after.slice(0, midStart)}
      {mid ? <span className={styles.diffNew}>{mid}</span> : null}
      {after.slice(midEnd)}
    </>
  );
}

function commonPrefixLen(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function commonSuffixLen(a: string, b: string): number {
  let i = 0;
  while (
    i < a.length &&
    i < b.length &&
    a[a.length - 1 - i] === b[b.length - 1 - i]
  ) {
    i++;
  }
  return i;
}

function renameNoteLabel(
  note: GlossaryRenameNote,
  t: (
    key: import("@/i18n").MessageKey,
    vars?: Record<string, string>,
  ) => string,
): string {
  if (note.kind === "after") {
    return note.generations >= 2
      ? t("glossary.logRenameAfterN", { n: String(note.generations) })
      : t("glossary.logRenameAfter");
  }
  return note.generations >= 2
    ? t("glossary.logRenameLegacyN", {
        origin: note.origin,
        n: String(note.generations),
      })
    : t("glossary.logRenameLegacy", { origin: note.origin });
}

function renameNoteHint(
  note: GlossaryRenameNote,
  t: (
    key: import("@/i18n").MessageKey,
    vars?: Record<string, string>,
  ) => string,
): string {
  return note.kind === "after"
    ? t("glossary.logRenameAfterHint")
    : t("glossary.logRenameLegacyHint", { origin: note.origin });
}

function statusBadgeLabel(
  status: GlossaryLog["status"],
  t: (key: import("@/i18n").MessageKey) => string,
): string {
  switch (status) {
    case "active":
      return t("glossary.logFilterActive");
    case "removed":
      return t("glossary.logFilterRemoved");
    case "modified":
      return t("glossary.logFilterModified");
    case "revoked":
      return t("glossary.logFilterRevoked");
    case "blocked":
      return t("glossary.logFilterBlocked");
    case "yielded":
      return t("glossary.logFilterYielded");
    case "rename":
      return t("glossary.logFilterModified");
    default:
      return String(status);
  }
}

function formatHostLabel(
  tree: TreeNode[],
  glossary: GlossaryNode[],
  hostId: string,
): string {
  const num = getNumberById(tree, hostId);
  const node = findNodeById(tree, hostId);
  if (node) return `${num || "·"} · ${node.title}`;
  const g = findGlossaryById(glossary, hostId);
  if (g) return `词表 · ${g.title}`;
  return hostId;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
