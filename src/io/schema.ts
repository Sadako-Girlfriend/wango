/**
 * .wango 版本与结构校验。
 * 不负责弹对话框；只校验对象形态。
 */

import type { ProjectData, TreeNode, WangoFile } from "@/domain";
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
  return Array.isArray(v.tree) && v.tree.every(isTreeNode);
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

/**
 * 将任意合法 WangoFile 规范到当前版本。
 * 后续版本差异在此分支兼容。
 */
export function migrateWangoFile(file: WangoFile): WangoFile {
  // 1.0：补全 name；刷新版本号
  if (file.wangoVersion === "1.0" || file.wangoVersion.startsWith("1.")) {
    const raw = file.projectData as ProjectData & { name?: string };
    const name =
      (typeof raw.name === "string" && raw.name.trim()) ||
      raw.tree[0]?.title?.trim() ||
      t("project.untitled");
    return {
      ...file,
      wangoVersion: CURRENT_WANGO_VERSION,
      projectData: { ...raw, name },
    };
  }
  throw new Error(`不支持的 .wango 版本：${file.wangoVersion}`);
}
