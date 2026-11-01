/**
 * 本机路径工具：保留中文与空格，只剔除 Windows 非法文件名字符。
 */

import type { ProjectData } from "@/domain";
import { t } from "@/i18n";

/** 去掉首尾空白，统一分隔符展示用（读写仍用原 path） */
export function trimPath(path: string): string {
  return path.trim();
}

/** 强制另存为 .wango；若已是 .json 则替换后缀 */
export function ensureWangoExtension(path: string): string {
  const p = trimPath(path);
  if (/\.wango$/i.test(p)) return p;
  if (/\.json$/i.test(p)) return p.replace(/\.json$/i, ".wango");
  return `${p}.wango`;
}

/** 文件名非法字符替换；保留中文、空格、括号等 */
export function sanitizeFileBaseName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\.+$/g, "");
  return cleaned.slice(0, 80) || "project";
}

/** 根据项目名生成默认文件名（可含中文、空格；与磁盘改名无关） */
export function defaultWangoFileName(project: ProjectData): string {
  const title =
    project.name?.trim() ||
    project.tree[0]?.title ||
    t("project.untitled");
  return `${sanitizeFileBaseName(title)}.wango`;
}

export function defaultMarkdownFileName(
  project: ProjectData,
  kind: "ai" | "mindmap",
): string {
  const base = sanitizeFileBaseName(
    project.name?.trim() ||
      project.tree[0]?.title ||
      t("export.defaultBase"),
  );
  return `${base}${kind === "ai" ? t("export.aiSuffix") : t("export.mindmapSuffix")}`;
}

/** 思维导图 PNG 默认文件名 */
export function defaultMindmapPngFileName(project: ProjectData): string {
  const base = sanitizeFileBaseName(
    project.name?.trim() ||
      project.tree[0]?.title ||
      t("export.defaultBase"),
  );
  return `${base}${t("export.mindmapPngSuffix")}`;
}

/** 长图 PDF 默认文件名 */
export function defaultLongPdfFileName(
  project: ProjectData,
  scopeLabel?: string,
): string {
  const base = sanitizeFileBaseName(
    scopeLabel?.trim() ||
      project.name?.trim() ||
      project.tree[0]?.title ||
      t("export.defaultBase"),
  );
  return `${base}${t("export.longPdfSuffix")}`;
}

/** 内容长图 PNG 默认文件名 */
export function defaultContentLongPngFileName(project: ProjectData): string {
  const base = sanitizeFileBaseName(
    project.name?.trim() ||
      project.tree[0]?.title ||
      t("export.defaultBase"),
  );
  return `${base}${t("export.contentLongPngSuffix")}`;
}

/** 批量图片子文件夹名 */
export function defaultContentBatchFolderName(
  project: ProjectData,
  mode: "node" | "major",
): string {
  const base = sanitizeFileBaseName(
    project.name?.trim() ||
      project.tree[0]?.title ||
      t("export.defaultBase"),
  );
  const stamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, "-");
  const tag =
    mode === "node"
      ? t("export.contentBatchNodeFolderTag")
      : t("export.contentBatchMajorFolderTag");
  return `${base}-${tag}-${stamp}`;
}

/** 从完整路径取父目录，供另存对话框 defaultPath 记忆目录 */
export function parentDir(path: string | null | undefined): string | null {
  if (!path) return null;
  const norm = path.replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  if (i <= 0) return null;
  return path.slice(0, path.length - (norm.length - i));
}
