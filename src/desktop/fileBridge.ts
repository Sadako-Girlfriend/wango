/**
 * 桌面文件桥：.wango 打开/保存/另存；导出 Markdown。
 * .wango 一律为 ZIP（project.json + 可选 attachments/）；老纯 JSON 仅打开兼容。
 * 用户路径一律走 Rust 读写，兼容中文目录与空格。
 */

import {
  collectAllMediaRelPaths,
  type AgentSession,
  type AgentThread,
  type ProjectData,
} from "@/domain";
import { decodeWangoBytes, encodePackageWango } from "@/io";
import {
  readBlobsByRelPaths,
  stageAttachmentBlobs,
} from "./attachmentBridge";
import { isTauriRuntime } from "./draftStore";
import {
  nativeReadBytes,
  nativeWriteBytes,
  nativeWriteText,
} from "./nativeFs";
import {
  resolveExportDefaultDir,
  resolveExportDefaultPath,
} from "./appSettings";
import {
  defaultContentBatchFolderName,
  defaultContentLongPngFileName,
  defaultDocxFileName,
  defaultLongPdfFileName,
  defaultMarkdownFileName,
  defaultMindmapPngFileName,
  defaultWangoFileName,
  ensureWangoExtension,
  parentDir,
  sanitizeFileBaseName,
  trimPath,
} from "./pathUtils";

export interface SaveDialogOptions {
  /** 对话框默认文件名（可含中文、空格） */
  defaultName?: string;
  /** 记忆上次目录：传完整路径或目录 */
  defaultPath?: string | null;
}

/** 弹出另存对话框，返回用户选的路径（已补扩展名） */
async function pickSavePath(
  defaultName: string,
  filters: { name: string; extensions: string[] }[],
  defaultPath?: string | null,
): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const dir = parentDir(defaultPath ?? undefined);
  const suggested =
    dir != null
      ? `${dir.replace(/[\\/]$/, "")}${dir.includes("\\") ? "\\" : "/"}${defaultName}`
      : defaultName;
  const path = await save({
    defaultPath: suggested,
    filters,
  });
  if (!path) return null;
  return trimPath(path);
}

/** 另存 Markdown / 文本（路径支持中文与空格） */
export async function saveTextFile(
  defaultName: string,
  contents: string,
  filters?: { name: string; extensions: string[] }[],
  options?: SaveDialogOptions,
): Promise<string | null> {
  if (isTauriRuntime()) {
    const path = await pickSavePath(
      options?.defaultName ?? defaultName,
      filters ?? [{ name: "Text", extensions: ["txt", "md"] }],
      options?.defaultPath,
    );
    if (!path) return null;
    await nativeWriteText(path, contents);
    return path;
  }

  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = options?.defaultName ?? defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return null;
}

/** 收集附件字节并打成统一 .wango ZIP */
async function buildWangoBytes(
  project: ProjectData,
  agent?: AgentSession | AgentThread | null,
): Promise<Uint8Array> {
  const rels = collectAllMediaRelPaths(project.tree);
  const blobs = rels.length > 0 ? await readBlobsByRelPaths(rels) : [];
  return encodePackageWango(project, blobs, { agent: agent ?? null });
}

/** 覆盖写入指定路径的 .wango（始终 ZIP；日常保存不带 Agent） */
export async function saveWangoToPath(
  project: ProjectData,
  path: string,
  agent?: AgentSession | AgentThread | null,
): Promise<void> {
  const target = ensureWangoExtension(trimPath(path));

  if (isTauriRuntime()) {
    const bytes = await buildWangoBytes(project, agent);
    await nativeWriteBytes(target, bytes);
    return;
  }
  throw new Error("浏览器预览无法静默写回 .wango，请用「另存为」下载");
}

export type SaveWangoFileOptions = SaveDialogOptions & {
  /** 导出时可选写入 Agent 对话 */
  agent?: AgentSession | AgentThread | null;
};

/** 另存为 .wango；返回最终路径 */
export async function saveWangoFile(
  project: ProjectData,
  options?: SaveWangoFileOptions,
): Promise<string | null> {
  const suggested = options?.defaultName ?? defaultWangoFileName(project);
  const agent = options?.agent ?? null;

  if (isTauriRuntime()) {
    const picked = await pickSavePath(
      suggested,
      [{ name: "WanGou", extensions: ["wango"] }],
      options?.defaultPath,
    );
    if (!picked) return null;
    const path = ensureWangoExtension(picked);
    await saveWangoToPath(project, path, agent);
    return path;
  }

  const bytes = await buildWangoBytes(project, agent);
  const blob = new Blob([bytes.slice()], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggested.endsWith(".wango")
    ? suggested
    : `${suggested}.wango`;
  a.click();
  URL.revokeObjectURL(url);
  return null;
}

/** 有路径则覆盖保存，否则另存为（返回实际写入路径，.json 会规范成 .wango） */
export async function saveOrSaveAsWango(
  project: ProjectData,
  filePath: string | null,
): Promise<string | null> {
  if (filePath) {
    const target = ensureWangoExtension(trimPath(filePath));
    await saveWangoToPath(project, target);
    return target;
  }
  return saveWangoFile(project, {
    defaultName: defaultWangoFileName(project),
  });
}

/** 选大纲导入文件（.docx / .md） */
export async function pickOutlineImportFile(): Promise<{
  fileName: string;
  kind: "markdown" | "docx";
  text?: string;
  bytes?: ArrayBuffer;
} | null> {
  const acceptKind = (name: string): "markdown" | "docx" | null => {
    const n = name.toLowerCase();
    if (n.endsWith(".md") || n.endsWith(".markdown")) return "markdown";
    if (n.endsWith(".docx")) return "docx";
    return null;
  };

  if (isTauriRuntime()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
      multiple: false,
      filters: [
        { name: "Outline", extensions: ["docx", "md", "markdown"] },
      ],
    });
    if (!path || Array.isArray(path)) return null;
    const abs = trimPath(path);
    const fileName = abs.replace(/^.*[/\\]/, "");
    const kind = acceptKind(fileName);
    if (!kind) return null;
    const bytes = await nativeReadBytes(abs);
    if (kind === "markdown") {
      const text = new TextDecoder("utf-8").decode(bytes);
      return { fileName, kind, text };
    }
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return { fileName, kind, bytes: copy.buffer };
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".docx,.md,.markdown,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const kind = acceptKind(file.name);
      if (!kind) {
        resolve(null);
        return;
      }
      if (kind === "markdown") {
        resolve({ fileName: file.name, kind, text: await file.text() });
      } else {
        resolve({
          fileName: file.name,
          kind,
          bytes: await file.arrayBuffer(),
        });
      }
    };
    input.click();
  });
}

/** 打开 .wango（路径支持中文与空格；兼容老纯 JSON） */
export async function openWangoFile(): Promise<{
  project: ProjectData;
  path: string | null;
  agent: AgentSession | null;
} | null> {
  if (isTauriRuntime()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
      multiple: false,
      filters: [{ name: "WanGou", extensions: ["wango", "json"] }],
    });
    if (!path || Array.isArray(path)) return null;
    return loadWangoFromPath(trimPath(path));
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".wango,.json,application/json,application/zip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const buf = new Uint8Array(await file.arrayBuffer());
      const { projectData, files, agent } = await decodeWangoBytes(buf);
      await stageAttachmentBlobs(files);
      resolve({ project: projectData, path: file.name, agent });
    };
    input.click();
  });
}

/** 按绝对路径加载（历史恢复等；兼容老纯 JSON） */
export async function loadWangoFromPath(path: string): Promise<{
  project: ProjectData;
  path: string;
  agent: AgentSession | null;
}> {
  const abs = trimPath(path);
  const bytes = await nativeReadBytes(abs);
  const { projectData, files, agent } = await decodeWangoBytes(bytes);
  await stageAttachmentBlobs(files);
  return { project: projectData, path: abs, agent };
}

/** 导出喂 AI Markdown */
export async function exportMarkdownFile(
  project: ProjectData,
  kind: "ai" | "mindmap",
  contents: string,
  lastDir?: string | null,
): Promise<string | null> {
  const name = defaultMarkdownFileName(project, kind);
  return saveTextFile(name, contents, [{ name: "Markdown", extensions: ["md"] }], {
    defaultName: name,
    defaultPath: resolveExportDefaultPath(name, lastDir),
  });
}

function ensurePngExtension(path: string): string {
  const p = trimPath(path);
  if (/\.png$/i.test(p)) return p;
  return `${p}.png`;
}

/** 另存 PNG 二进制 */
export async function savePngFile(
  defaultName: string,
  bytes: Uint8Array,
  options?: SaveDialogOptions,
): Promise<string | null> {
  if (isTauriRuntime()) {
    const path = await pickSavePath(
      options?.defaultName ?? defaultName,
      [{ name: "PNG", extensions: ["png"] }],
      options?.defaultPath,
    );
    if (!path) return null;
    const target = ensurePngExtension(path);
    await nativeWriteBytes(target, bytes);
    return target;
  }

  const blob = new Blob([bytes.slice()], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = options?.defaultName ?? defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return null;
}

/** 导出教材风思维导图 PNG */
export async function exportMindmapPngFile(
  project: ProjectData,
  blob: Blob,
  lastDir?: string | null,
): Promise<string | null> {
  const name = defaultMindmapPngFileName(project);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return savePngFile(name, bytes, {
    defaultName: name,
    defaultPath: resolveExportDefaultPath(name, lastDir),
  });
}

function ensurePdfExtension(path: string): string {
  const p = trimPath(path);
  if (/\.pdf$/i.test(p)) return p;
  return `${p}.pdf`;
}

/** 另存 PDF 二进制 */
export async function savePdfFile(
  defaultName: string,
  bytes: Uint8Array,
  options?: SaveDialogOptions,
): Promise<string | null> {
  if (isTauriRuntime()) {
    const path = await pickSavePath(
      options?.defaultName ?? defaultName,
      [{ name: "PDF", extensions: ["pdf"] }],
      options?.defaultPath,
    );
    if (!path) return null;
    const target = ensurePdfExtension(path);
    await nativeWriteBytes(target, bytes);
    return target;
  }

  const blob = new Blob([bytes.slice()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = options?.defaultName ?? defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return null;
}

/** 导出无缝长图 PDF */
export async function exportLongPdfFile(
  project: ProjectData,
  blob: Blob,
  lastDir?: string | null,
  scopeLabel?: string,
): Promise<string | null> {
  const name = defaultLongPdfFileName(project, scopeLabel);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return savePdfFile(name, bytes, {
    defaultName: name,
    defaultPath: resolveExportDefaultPath(name, lastDir),
  });
}

function ensureDocxExtension(path: string): string {
  const p = trimPath(path);
  if (/\.docx$/i.test(p)) return p;
  return `${p}.docx`;
}

/** 另存 Word .docx 二进制 */
export async function saveDocxFile(
  defaultName: string,
  bytes: Uint8Array,
  options?: SaveDialogOptions,
): Promise<string | null> {
  if (isTauriRuntime()) {
    const path = await pickSavePath(
      options?.defaultName ?? defaultName,
      [{ name: "Word", extensions: ["docx"] }],
      options?.defaultPath,
    );
    if (!path) return null;
    const target = ensureDocxExtension(path);
    await nativeWriteBytes(target, bytes);
    return target;
  }

  const blob = new Blob([bytes.slice()], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = options?.defaultName ?? defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return null;
}

/** 导出 Word .docx */
export async function exportDocxFile(
  project: ProjectData,
  blob: Blob,
  lastDir?: string | null,
  scopeLabel?: string,
): Promise<string | null> {
  const name = defaultDocxFileName(project, scopeLabel);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return saveDocxFile(name, bytes, {
    defaultName: name,
    defaultPath: resolveExportDefaultPath(name, lastDir),
  });
}

/** 导出单张内容长图 PNG */
export async function exportContentLongPngFile(
  project: ProjectData,
  blob: Blob,
  lastDir?: string | null,
): Promise<string | null> {
  const name = defaultContentLongPngFileName(project);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return savePngFile(name, bytes, {
    defaultName: name,
    defaultPath: resolveExportDefaultPath(name, lastDir),
  });
}

function joinPath(dir: string, name: string): string {
  const d = dir.replace(/[\\/]+$/, "");
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${d}${sep}${name}`;
}

/**
 * 批量内容图：桌面选父目录后自动建子文件夹写入；
 * 浏览器降级为 ZIP 下载。
 */
export async function exportContentPngBatch(
  project: ProjectData,
  mode: "node" | "major",
  items: { fileName: string; blob: Blob }[],
  lastDir?: string | null,
): Promise<string | null> {
  if (!items.length) throw new Error("没有可导出的图片");
  const folderName = defaultContentBatchFolderName(project, mode);

  if (isTauriRuntime()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { mkdir } = await import("@tauri-apps/plugin-fs");
    const picked = await open({
      directory: true,
      multiple: false,
      defaultPath: resolveExportDefaultDir(lastDir),
    });
    if (!picked || typeof picked !== "string") return null;
    const dest = joinPath(picked, folderName);
    await mkdir(dest, { recursive: true });
    const used = new Set<string>();
    for (const item of items) {
      let name = item.fileName;
      const base = name.replace(/\.png$/i, "");
      let n = 1;
      while (used.has(name.toLowerCase())) {
        name = `${base}-${n}.png`;
        n += 1;
      }
      used.add(name.toLowerCase());
      const bytes = new Uint8Array(await item.blob.arrayBuffer());
      await nativeWriteBytes(joinPath(dest, name), bytes);
    }
    return dest;
  }

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const folder = zip.folder(folderName);
  if (!folder) throw new Error("无法创建压缩包");
  const used = new Set<string>();
  for (const item of items) {
    let name = item.fileName;
    const base = name.replace(/\.png$/i, "");
    let n = 1;
    while (used.has(name.toLowerCase())) {
      name = `${base}-${n}.png`;
      n += 1;
    }
    used.add(name.toLowerCase());
    folder.file(name, item.blob);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFileBaseName(folderName)}.zip`;
  a.click();
  URL.revokeObjectURL(url);
  return null;
}
