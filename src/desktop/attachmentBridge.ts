/**
 * 附件/媒体草稿桥：选文件或拖入 → 拷入应用数据目录。
 * 图片进正文；常见文本进代码块；zip/pdf 等走附件栏。
 */

import { createId, type AttachmentMeta } from "@/domain";
import type { AttachmentBlob } from "@/io";
import { t } from "@/i18n";
import {
  getAppDataDir,
  isTauriRuntime,
  joinPath,
  memoryDelete,
  memoryGet,
  memoryPut,
  resolveDraftPath,
} from "./draftStore";
import { nativeReadBytes } from "./nativeFs";
import { rememberDisplayUrl, toDisplayUrl } from "./mediaUrl";

/** 拖入正文代码块的体积上限（过大改走附件） */
const MAX_INLINE_TEXT_BYTES = 200 * 1024;

/** 扩展名 → TipTap codeBlock language（空串 = 纯文本） */
const INLINE_TEXT_LANG: Record<string, string> = {
  txt: "",
  md: "markdown",
  markdown: "markdown",
  json: "json",
  py: "python",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  css: "css",
  html: "html",
  htm: "html",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  toml: "",
  csv: "",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
};

export function isImageFileName(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}

export function isInlineTextFileName(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return Object.prototype.hasOwnProperty.call(INLINE_TEXT_LANG, ext);
}

export function languageFromFileName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return INLINE_TEXT_LANG[ext] ?? "";
}

function guessMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    txt: "text/plain",
    md: "text/markdown",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    zip: "application/zip",
    rar: "application/vnd.rar",
    "7z": "application/x-7z-compressed",
  };
  return map[ext] ?? "application/octet-stream";
}

/** 保留中文与空格，只去掉 Windows 非法字符 */
function safeFileName(name: string): string {
  return (
    name
      .trim()
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/[\u0000-\u001f]/g, "")
      .replace(/\.+$/g, "")
      .slice(0, 120) || "file"
  );
}

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || "file";
}

export { resolveDraftPath };

export interface StagedImage {
  name: string;
  relPath: string;
  displayUrl: string;
}

/** 拖入正文：文件名作标题 + 代码块 */
export interface StagedInlineText {
  name: string;
  language: string;
  content: string;
}

export interface StageResult {
  images: StagedImage[];
  files: AttachmentMeta[];
  texts: StagedInlineText[];
}

export interface StageOptions {
  /** 默认 true：名单内文本进代码块；附件按钮选文件时传 false */
  inlineText?: boolean;
}

function decodeUtf8Text(bytes: Uint8Array): string | null {
  // 粗判二进制：前 8KB 含太多 NUL
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  let nul = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) nul += 1;
  }
  if (nul > 0) return null;
  let text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

async function readInlineTextFromPath(
  src: string,
): Promise<StagedInlineText | null> {
  const name = safeFileName(basename(src));
  const bytes = await nativeReadBytes(src);
  if (bytes.length > MAX_INLINE_TEXT_BYTES) return null;
  const content = decodeUtf8Text(bytes);
  if (content == null) return null;
  return {
    name,
    language: languageFromFileName(name),
    content,
  };
}

async function readInlineTextFromBrowserFile(
  file: File,
): Promise<StagedInlineText | null> {
  const name = safeFileName(file.name || "file.txt");
  if (file.size > MAX_INLINE_TEXT_BYTES) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const content = decodeUtf8Text(bytes);
  if (content == null) return null;
  return {
    name,
    language: languageFromFileName(name),
    content,
  };
}

async function stageOneFromPath(src: string): Promise<
  | { kind: "image"; image: StagedImage }
  | { kind: "file"; file: AttachmentMeta }
> {
  const { mkdir, copyFile } = await import("@tauri-apps/plugin-fs");
  const root = await getAppDataDir();
  const id = createId();
  const name = safeFileName(basename(src));
  const relPath = `attachments/${id}/${name}`;
  const destDir = joinPath(root, "attachments", id);
  const dest = joinPath(destDir, name);
  await mkdir(destDir, { recursive: true });
  await copyFile(src, dest);

  if (isImageFileName(name)) {
    const displayUrl = await toDisplayUrl(relPath);
    rememberDisplayUrl(displayUrl, relPath);
    return { kind: "image", image: { name, relPath, displayUrl } };
  }
  return {
    kind: "file",
    file: { id, name, mime: guessMime(name), relPath },
  };
}

async function stageOneFromBrowserFile(file: File): Promise<
  | { kind: "image"; image: StagedImage }
  | { kind: "file"; file: AttachmentMeta }
> {
  const id = createId();
  const name = safeFileName(file.name || `image-${id}.png`);
  const relPath = `attachments/${id}/${name}`;
  const buf = new Uint8Array(await file.arrayBuffer());

  // Tauri 下必须落盘，convertFileSrc 才能显示；浏览器走内存
  if (isTauriRuntime()) {
    const { mkdir, writeFile } = await import("@tauri-apps/plugin-fs");
    const root = await getAppDataDir();
    const destDir = joinPath(root, "attachments", id);
    await mkdir(destDir, { recursive: true });
    await writeFile(joinPath(destDir, name), buf);
  } else {
    memoryPut(relPath, buf);
  }

  if (isImageFileName(name) || file.type.startsWith("image/")) {
    const displayUrl = await toDisplayUrl(relPath);
    rememberDisplayUrl(displayUrl, relPath);
    return { kind: "image", image: { name, relPath, displayUrl } };
  }
  return {
    kind: "file",
    file: {
      id,
      name,
      mime: file.type || guessMime(name),
      relPath,
    },
  };
}

export async function stageLocalPaths(
  paths: string[],
  options?: StageOptions,
): Promise<StageResult> {
  const inlineText = options?.inlineText !== false;
  const images: StagedImage[] = [];
  const files: AttachmentMeta[] = [];
  const texts: StagedInlineText[] = [];

  const imagePaths: string[] = [];
  const otherPaths: string[] = [];

  for (const src of paths) {
    const name = basename(src);
    if (inlineText && isInlineTextFileName(name)) {
      try {
        const text = await readInlineTextFromPath(src);
        if (text) {
          texts.push(text);
          continue;
        }
      } catch (err) {
        console.warn("读取文本进正文失败，改走附件", src, err);
      }
      otherPaths.push(src);
      continue;
    }
    if (isImageFileName(name)) imagePaths.push(src);
    else otherPaths.push(src);
  }

  const rest = [...imagePaths, ...otherPaths];

  // 优先走 Rust 直拷：拖放源路径不受 plugin-fs ACL 限制
  if (isTauriRuntime() && rest.length) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const imported = await invoke<[string, string][]>("import_dropped_paths", {
        paths: rest,
      });
      for (const [name, relPath] of imported) {
        const id = relPath.split("/")[1] ?? createId();
        if (isImageFileName(name)) {
          const displayUrl = await toDisplayUrl(relPath);
          rememberDisplayUrl(displayUrl, relPath);
          images.push({ name, relPath, displayUrl });
        } else {
          files.push({ id, name, mime: guessMime(name), relPath });
        }
      }
      if (imported.length) return { images, files, texts };
    } catch (err) {
      console.warn("import_dropped_paths 失败，回退 copyFile", err);
    }
  }

  for (const src of rest) {
    const item = await stageOneFromPath(src);
    if (item.kind === "image") images.push(item.image);
    else files.push(item.file);
  }
  return { images, files, texts };
}

export async function stageBrowserFiles(
  fileList: File[],
  options?: StageOptions,
): Promise<StageResult> {
  const inlineText = options?.inlineText !== false;
  const images: StagedImage[] = [];
  const files: AttachmentMeta[] = [];
  const texts: StagedInlineText[] = [];

  for (const file of fileList) {
    const path = (file as File & { path?: string }).path;
    const name = file.name || (path ? basename(path) : "file");

    if (inlineText && isInlineTextFileName(name)) {
      try {
        if (path && isTauriRuntime()) {
          const text = await readInlineTextFromPath(path);
          if (text) {
            texts.push(text);
            continue;
          }
        } else {
          const text = await readInlineTextFromBrowserFile(file);
          if (text) {
            texts.push(text);
            continue;
          }
        }
      } catch (err) {
        console.warn("读取文本进正文失败，改走附件", name, err);
      }
    }

    if (path && isTauriRuntime()) {
      const item = await stageOneFromPath(path);
      if (item.kind === "image") images.push(item.image);
      else files.push(item.file);
      continue;
    }
    const item = await stageOneFromBrowserFile(file);
    if (item.kind === "image") images.push(item.image);
    else files.push(item.file);
  }
  return { images, files, texts };
}

export async function pickAndStage(options?: {
  imagesOnly?: boolean;
  filesOnly?: boolean;
}): Promise<StageResult> {
  if (isTauriRuntime()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const filters = options?.imagesOnly
      ? [
          {
            name: t("dialog.filter.image"),
            extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"],
          },
        ]
      : options?.filesOnly
        ? [
            {
              name: t("dialog.filter.file"),
              extensions: [
                "pdf",
                "zip",
                "rar",
                "7z",
                "doc",
                "docx",
                "xls",
                "xlsx",
                "txt",
                "md",
              ],
            },
          ]
        : undefined;
    const selected = await open({
      multiple: true,
      directory: false,
      filters,
    });
    if (!selected) return { images: [], files: [], texts: [] };
    const paths = Array.isArray(selected) ? selected : [selected];
    // 附件按钮：不自动进代码块；图片按钮只要图
    const staged = await stageLocalPaths(paths, {
      inlineText: !options?.filesOnly && !options?.imagesOnly,
    });
    if (options?.imagesOnly) {
      return { images: staged.images, files: [], texts: [] };
    }
    if (options?.filesOnly) {
      return { images: [], files: staged.files, texts: [] };
    }
    return staged;
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    if (options?.imagesOnly) input.accept = "image/*";
    input.onchange = async () => {
      const list = [...(input.files ?? [])];
      const staged = await stageBrowserFiles(list, {
        inlineText: !options?.filesOnly && !options?.imagesOnly,
      });
      if (options?.imagesOnly) {
        resolve({ images: staged.images, files: [], texts: [] });
      } else if (options?.filesOnly) {
        resolve({ images: [], files: staged.files, texts: [] });
      } else resolve(staged);
    };
    input.click();
  });
}

export async function openStagedAttachment(meta: AttachmentMeta): Promise<void> {
  if (isTauriRuntime()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const abs = await resolveDraftPath(meta.relPath);
    await invoke("open_path", { path: abs });
    return;
  }
  const data = memoryGet(meta.relPath);
  if (!data) throw new Error("浏览器预览态找不到该附件数据");
  const blob = new Blob([data.slice()], { type: meta.mime });
  window.open(URL.createObjectURL(blob), "_blank");
}

export async function removeStagedAttachment(meta: AttachmentMeta): Promise<void> {
  if (isTauriRuntime()) {
    const { remove, exists } = await import("@tauri-apps/plugin-fs");
    const abs = await resolveDraftPath(meta.relPath);
    if (await exists(abs)) await remove(abs);
    const dir = abs.replace(/[/\\][^/\\]+$/, "");
    try {
      await remove(dir, { recursive: true });
    } catch {
      /* ignore */
    }
    return;
  }
  memoryDelete(meta.relPath);
}

export async function readAttachmentBlobs(
  metas: AttachmentMeta[],
): Promise<AttachmentBlob[]> {
  const files: AttachmentBlob[] = [];
  if (isTauriRuntime()) {
    const { readFile, exists } = await import("@tauri-apps/plugin-fs");
    for (const meta of metas) {
      const abs = await resolveDraftPath(meta.relPath);
      if (!(await exists(abs))) throw new Error(`附件缺失：${meta.name}`);
      files.push({ relPath: meta.relPath, data: await readFile(abs) });
    }
    return files;
  }
  for (const meta of metas) {
    const data = memoryGet(meta.relPath);
    if (!data) throw new Error(`附件缺失：${meta.name}`);
    files.push({ relPath: meta.relPath, data });
  }
  return files;
}

export async function readBlobsByRelPaths(
  relPaths: string[],
): Promise<AttachmentBlob[]> {
  const unique = [...new Set(relPaths)];
  return readAttachmentBlobs(
    unique.map((relPath) => ({
      id: relPath,
      name: basename(relPath),
      mime: guessMime(basename(relPath)),
      relPath,
    })),
  );
}

export async function stageAttachmentBlobs(files: AttachmentBlob[]): Promise<void> {
  if (isTauriRuntime()) {
    const { mkdir, writeFile } = await import("@tauri-apps/plugin-fs");
    const root = await getAppDataDir();
    for (const file of files) {
      const abs = joinPath(root, file.relPath);
      const dir = abs.replace(/[/\\][^/\\]+$/, "");
      await mkdir(dir, { recursive: true });
      await writeFile(
        abs,
        file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data),
      );
    }
    return;
  }
  for (const file of files) {
    memoryPut(
      file.relPath,
      file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data),
    );
  }
}
