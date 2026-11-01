/**
 * .wango 统一 ZIP 包编解码（类似 .docx）：
 * - 必有 project.json（树与文本）
 * - 有图片/附件时含 attachments/...
 * 老版本纯 JSON .wango 由 decodeWangoBytes 兜底解析。
 */

import JSZip from "jszip";
import type { ProjectData, WangoFile } from "@/domain";
import { decodeJsonWango } from "./jsonCodec";
import {
  CURRENT_WANGO_VERSION,
  isWangoFile,
  migrateWangoFile,
} from "./schema";

export interface AttachmentBlob {
  relPath: string;
  data: ArrayBuffer | Uint8Array;
}

/** 打成 .wango ZIP 字节（无论是否有附件一律走 ZIP） */
export async function encodePackageWango(
  projectData: ProjectData,
  files: AttachmentBlob[] = [],
): Promise<Uint8Array> {
  const zip = new JSZip();
  const manifest: WangoFile = {
    wangoVersion: CURRENT_WANGO_VERSION,
    exportedAt: new Date().toISOString(),
    projectData,
  };
  zip.file("project.json", JSON.stringify(manifest, null, 2));
  for (const file of files) {
    // 统一正斜杠；文件名可含中文与空格
    const rel = file.relPath.replace(/\\/g, "/");
    zip.file(rel, file.data);
  }
  // UTF-8 文件名，避免中文附件在解压后乱码
  const buf = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
  return buf;
}

/** 从 ZIP 字节还原项目与附件表 */
export async function decodePackageWango(bytes: ArrayBuffer | Uint8Array): Promise<{
  projectData: ProjectData;
  files: AttachmentBlob[];
}> {
  const zip = await JSZip.loadAsync(bytes);
  const projectFile = zip.file("project.json");
  if (!projectFile) {
    throw new Error("ZIP 包缺少 project.json");
  }
  const text = await projectFile.async("string");
  const parsed: unknown = JSON.parse(text);
  if (!isWangoFile(parsed)) {
    throw new Error("project.json 不是合法 WangoFile");
  }
  const projectData = migrateWangoFile(parsed).projectData;

  const files: AttachmentBlob[] = [];
  const tasks: Promise<void>[] = [];
  zip.forEach((relativePath, entry) => {
    if (entry.dir || relativePath === "project.json") return;
    tasks.push(
      (async () => {
        const data = await entry.async("uint8array");
        files.push({ relPath: relativePath, data });
      })(),
    );
  });
  await Promise.all(tasks);
  return { projectData, files };
}

/** 根据魔数粗判是否 ZIP（PK\\x03\\x04） */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/**
 * 打开 .wango：优先按 ZIP 解压；否则按老版本纯 JSON 兜底。
 */
export async function decodeWangoBytes(
  bytes: ArrayBuffer | Uint8Array,
): Promise<{
  projectData: ProjectData;
  files: AttachmentBlob[];
}> {
  const view =
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (looksLikeZip(view)) {
    return decodePackageWango(view);
  }
  const text = new TextDecoder("utf-8").decode(view);
  return { projectData: decodeJsonWango(text), files: [] };
}
