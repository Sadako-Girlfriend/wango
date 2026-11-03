/**
 * 清理从网页/文档粘贴带入的脏 HTML，以及导出前的正文消毒。
 *
 * 常见污染：
 * - `<span style="color:...;font-family:...">`（微信/飞书/浏览器复制）
 * - 行尾 `\` 硬换行、多余空段导致导出行距异常
 */

const STYLE_ONLY_TAGS = new Set([
  "span",
  "font",
  "o:p",
  "article",
  "section",
  "header",
  "footer",
  "main",
  "aside",
]);

const DROP_TAGS = new Set(["script", "style", "meta", "link", "xml", "head"]);

/** 无 DOM 时的回退：剥样式壳标签 */
function stripPasteHtmlRegex(html: string): string {
  let out = html.replace(
    /<\/?(?:script|style|meta|link)(?:\s[^>]*)?>/gi,
    "",
  );
  for (let i = 0; i < 8; i++) {
    const next = out.replace(/<\/?(?:span|font)(?:\s[^>]*)?>/gi, "");
    if (next === out) break;
    out = next;
  }
  // 去掉残留 style/class 属性
  out = out.replace(/\s(?:style|class|id|lang|color|face|size|bgcolor|align)="[^"]*"/gi, "");
  out = out.replace(/\s(?:style|class|id|lang|color|face|size|bgcolor|align)='[^']*'/gi, "");
  return out;
}

/** 去掉粘贴 HTML 里的样式壳，保留结构与纯文本 */
export function stripPasteHtml(html: string): string {
  if (!html) return html;
  if (typeof DOMParser === "undefined") {
    return stripPasteHtmlRegex(html);
  }
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return stripPasteHtmlRegex(html);
  }
  const body = doc.body;
  if (!body) return stripPasteHtmlRegex(html);

  const walk = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (DROP_TAGS.has(tag)) {
      el.remove();
      return;
    }

    const children = [...el.childNodes];
    for (const child of children) walk(child);

    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (
        name === "style" ||
        name === "class" ||
        name === "id" ||
        name === "lang" ||
        name.startsWith("data-") ||
        name.startsWith("on") ||
        name === "color" ||
        name === "face" ||
        name === "size" ||
        name === "bgcolor" ||
        name === "align"
      ) {
        el.removeAttribute(attr.name);
      }
    }

    if (STYLE_ONLY_TAGS.has(tag)) {
      unwrapElement(el);
    }
  };

  walk(body);
  collapseEmptyParagraphs(body);
  return body.innerHTML;
}

function unwrapElement(el: HTMLElement) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function collapseEmptyParagraphs(root: HTMLElement) {
  const paras = [...root.querySelectorAll("p")];
  let prevEmpty = false;
  for (const p of paras) {
    const empty = !p.textContent?.replace(/\u00a0/g, " ").trim() && !p.querySelector("img");
    if (empty && prevEmpty) {
      p.remove();
      continue;
    }
    prevEmpty = empty;
  }
}

/**
 * 清理已写入 Markdown 字符串中的脏 HTML / 硬换行噪声。
 * 可安全用于 onChange、导出。
 */
export function sanitizeMarkdownContent(md: string): string {
  if (!md) return md;
  let out = md;

  // 反复剥 span/font 外壳（含嵌套与带属性）
  for (let i = 0; i < 8; i++) {
    const next = out
      .replace(/<\/?(?:span|font)(?:\s[^>]*)?>/gi, "")
      .replace(/<\/?o:p(?:\s[^>]*)?>/gi, "");
    if (next === out) break;
    out = next;
  }

  // 解码常见实体（剥标签后留下的）
  out = out
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // 去掉「仅样式」残留的空标签对
  out = out.replace(/<(div|p|section|article)(?:\s[^>]*)?>\s*<\/\1>/gi, "\n\n");

  // Markdown 硬换行：行尾 `\` 或两空格；粘贴常带孤立 `\`
  out = out
    .split("\n")
    .map((line) => {
      let s = line.replace(/[ \t]+$/g, "");
      if (/^\\$/.test(s)) return "";
      // 行尾单独反斜杠硬换行 → 普通换行语义（去掉 \）
      if (/\\$/.test(s) && !/\\\\$/.test(s)) {
        s = s.slice(0, -1).replace(/[ \t]+$/g, "");
      }
      return s;
    })
    .join("\n");

  // 3+ 空行压成 2，统一段落间距
  out = out.replace(/\n{3,}/g, "\n\n");

  return out.trimEnd();
}
