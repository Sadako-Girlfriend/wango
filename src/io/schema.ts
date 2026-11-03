/**
 * .wango 版本与结构校验。
 * 不负责弹对话框；只校验对象形态。
 */

import type {
  GlossaryLink,
  GlossaryLog,
  GlossaryNode,
  ProjectData,
  TreeNode,
  WangoFile,
} from "@/domain";
import { t } from "@/i18n";

export const CURRENT_WANGO_VERSION = "1.0";

export function isWangoFile(value: unknown): value is WangoFile {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.wangoVersion === "string" &&
    typeof v.exportedAt === "string" &&
    isProjectData(v.projectData)
  );
}

export function isProjectData(value: unknown): value is ProjectData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  // name 可缺省：migrate 时补全（兼容旧 .wango）
  if (v.name !== undefined && typeof v.name !== "string") return false;
  if (!Array.isArray(v.tree) || !v.tree.every(isTreeNode)) return false;
  // 词表字段可缺省（migrate 补空）
  if (v.glossary !== undefined) {
    if (!Array.isArray(v.glossary) || !v.glossary.every(isGlossaryNode)) {
      return false;
    }
  }
  if (v.glossaryLinks !== undefined) {
    if (
      !Array.isArray(v.glossaryLinks) ||
      !v.glossaryLinks.every(isGlossaryLink)
    ) {
      return false;
    }
  }
  if (v.glossaryLogs !== undefined) {
    if (
      !Array.isArray(v.glossaryLogs) ||
      !v.glossaryLogs.every(isGlossaryLog)
    ) {
      return false;
    }
  }
  return true;
}

function isTreeNode(value: unknown): value is TreeNode {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (
    !(
      typeof v.id === "string" &&
      typeof v.title === "string" &&
      typeof v.content === "string" &&
      Array.isArray(v.children) &&
      v.children.every(isTreeNode) &&
      Array.isArray(v.attachments)
    )
  ) {
    return false;
  }
  // 可选：priority / labels（旧文件无此字段）
  if (
    v.priority !== undefined &&
    v.priority !== null &&
    v.priority !== "high" &&
    v.priority !== "medium" &&
    v.priority !== "low"
  ) {
    return false;
  }
  if (v.labels !== undefined) {
    if (!Array.isArray(v.labels)) return false;
    if (!v.labels.every((x) => typeof x === "string")) return false;
  }
  return true;
}

function isGlossaryNode(value: unknown): value is GlossaryNode {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.title !== "string") return false;
  if (typeof v.content !== "string") return false;
  if (v.kind !== "ref" && v.kind !== "copy" && v.kind !== "local") return false;
  if (v.sourceNodeId !== undefined && typeof v.sourceNodeId !== "string") {
    return false;
  }
  if (!Array.isArray(v.children) || !v.children.every(isGlossaryNode)) {
    return false;
  }
  if (!Array.isArray(v.aliases) || !v.aliases.every((x) => typeof x === "string")) {
    return false;
  }
  if (
    !Array.isArray(v.blacklist) ||
    !v.blacklist.every((x) => typeof x === "string")
  ) {
    return false;
  }
  if (v.renameHistory !== undefined) {
    if (!Array.isArray(v.renameHistory)) return false;
    if (
      !v.renameHistory.every((e) => {
        if (!e || typeof e !== "object") return false;
        const r = e as Record<string, unknown>;
        return (
          typeof r.from === "string" &&
          typeof r.to === "string" &&
          typeof r.at === "string"
        );
      })
    ) {
      return false;
    }
  }
  if (v.color !== undefined) {
    if (typeof v.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(v.color)) {
      return false;
    }
  }
  return true;
}

const LINK_STATUSES = new Set([
  "active",
  "removed",
  "modified",
  "revoked",
  "blocked",
  "yielded",
]);

function isGlossaryLink(value: unknown): value is GlossaryLink {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (
    !(
      typeof v.id === "string" &&
      typeof v.entryId === "string" &&
      typeof v.hostNodeId === "string" &&
      typeof v.start === "number" &&
      typeof v.end === "number" &&
      typeof v.matchedText === "string" &&
      typeof v.status === "string" &&
      LINK_STATUSES.has(v.status) &&
      typeof v.updatedAt === "string"
    )
  ) {
    return false;
  }
  if (v.originText !== undefined && typeof v.originText !== "string") {
    return false;
  }
  if (v.anchorText !== undefined && typeof v.anchorText !== "string") {
    return false;
  }
  if (v.source !== undefined && v.source !== "auto" && v.source !== "manual") {
    return false;
  }
  return true;
}

function isGlossaryLog(value: unknown): value is GlossaryLog {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.entryId !== "string") return false;
  if (v.kind !== "ref" && v.kind !== "edit") return false;
  if (typeof v.status !== "string") return false;
  if (typeof v.message !== "string" || typeof v.at !== "string") return false;
  return true;
}

/**
 * 将任意合法 WangoFile 规范到当前版本。
 * 后续版本差异在此分支兼容。
 */
function normalizeGlossaryNodes(nodes: GlossaryNode[]): GlossaryNode[] {
  return nodes.map((n) => {
    const color =
      typeof n.color === "string" && /^#[0-9a-fA-F]{6}$/.test(n.color)
        ? n.color
        : undefined;
    const next: GlossaryNode = {
      ...n,
      aliases: Array.isArray(n.aliases) ? n.aliases : [],
      blacklist: Array.isArray(n.blacklist) ? n.blacklist : [],
      renameHistory: Array.isArray(n.renameHistory) ? n.renameHistory : [],
      children: normalizeGlossaryNodes(
        Array.isArray(n.children) ? n.children : [],
      ),
    };
    if (color) next.color = color;
    else delete next.color;
    return next;
  });
}

export function migrateWangoFile(file: WangoFile): WangoFile {
  // 1.0：补全 name / glossary；刷新版本号
  if (file.wangoVersion === "1.0" || file.wangoVersion.startsWith("1.")) {
    const raw = file.projectData as ProjectData & { name?: string };
    const name =
      (typeof raw.name === "string" && raw.name.trim()) ||
      raw.tree[0]?.title?.trim() ||
      t("project.untitled");
    const glossaryLinks = (
      Array.isArray(raw.glossaryLinks) ? raw.glossaryLinks : []
    ).map((l) => ({
      ...l,
      originText: l.originText || l.matchedText,
    }));
    return {
      ...file,
      wangoVersion: CURRENT_WANGO_VERSION,
      projectData: {
        ...raw,
        name,
        glossary: normalizeGlossaryNodes(
          Array.isArray(raw.glossary) ? raw.glossary : [],
        ),
        glossaryLinks,
        glossaryLogs: Array.isArray(raw.glossaryLogs) ? raw.glossaryLogs : [],
      },
    };
  }
  throw new Error(`不支持的 .wango 版本：${file.wangoVersion}`);
}
