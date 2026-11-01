/**
 * 老版本纯 JSON 形态 .wango 的解码（仅导入兼容）。
 * 新文件一律由 packageCodec 打成 ZIP，不再写出裸 JSON。
 */

import type { ProjectData, WangoFile } from "@/domain";
import {
  CURRENT_WANGO_VERSION,
  isWangoFile,
  migrateWangoFile,
} from "./schema";

/** @deprecated 仅供测试或迁移；正式保存请用 encodePackageWango */
export function encodeJsonWango(projectData: ProjectData): string {
  const file: WangoFile = {
    wangoVersion: CURRENT_WANGO_VERSION,
    exportedAt: new Date().toISOString(),
    projectData,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function decodeJsonWango(text: string): ProjectData {
  const parsed: unknown = JSON.parse(text);
  if (!isWangoFile(parsed)) {
    throw new Error("不是合法的 .wango JSON 文件");
  }
  return migrateWangoFile(parsed).projectData;
}
