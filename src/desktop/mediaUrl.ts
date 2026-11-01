/**
 * 正文内嵌图片 URL：存盘用 attachments/... ；展示时换成可加载地址。
 * 同时兼容 Markdown 图与 <img src width>。
 */

import {
  isTauriRuntime,
  memoryGet,
  resolveDraftPath,
} from "./draftStore";

const displayToRel = new Map<string, string>();

const MD_RE = /!\[([^\]]*)\]\((attachments\/[^)\s]+)\)/g;

/** 相对路径 → 编辑器可显示的 src */
export async function toDisplayUrl(relPath: string): Promise<string> {
  if (isTauriRuntime()) {
    const abs = await resolveDraftPath(relPath);
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    const url = convertFileSrc(abs);
    displayToRel.set(url, relPath);
    return url;
  }
  const data = memoryGet(relPath);
  if (!data) return relPath;
  const url = URL.createObjectURL(new Blob([data.slice()]));
  displayToRel.set(url, relPath);
  return url;
}

/** 存盘 Markdown/HTML → 展示 */
export async function rewriteMarkdownForDisplay(md: string): Promise<string> {
  let out = md;

  for (const m of md.matchAll(MD_RE)) {
    const url = await toDisplayUrl(m[2]);
    out = out.replace(m[0], `![${m[1] ?? ""}](${url})`);
  }

  const htmlRe = /(<img\b[^>]*?\bsrc=["'])(attachments\/[^"']+)(["'][^>]*>)/gi;
  const htmlParts: Array<{ full: string; pre: string; rel: string; post: string }> =
    [];
  let hm: RegExpExecArray | null;
  const htmlScan = new RegExp(htmlRe.source, "gi");
  while ((hm = htmlScan.exec(out)) !== null) {
    htmlParts.push({ full: hm[0], pre: hm[1], rel: hm[2], post: hm[3] });
  }
  for (const p of htmlParts) {
    const url = await toDisplayUrl(p.rel);
    out = out.replace(p.full, `${p.pre}${url}${p.post}`);
  }

  return out;
}

/** 展示 URL → 相对路径写回 */
export function rewriteMarkdownForStorage(md: string): string {
  let out = md;
  const entries = [...displayToRel.entries()].sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [url, rel] of entries) {
    if (out.includes(url)) out = out.split(url).join(rel);
  }
  return out;
}

export function rememberDisplayUrl(displayUrl: string, relPath: string) {
  displayToRel.set(displayUrl, relPath);
}
