/**
 * GFM 管道表格 → HTML &lt;table&gt;，供 TipTap Table 扩展解析。
 * 无表格扩展时正文会把表格压成一行，PDF/导出也跟着乱。
 */

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function isSepRow(line: string): boolean {
  const cells = splitRow(line);
  if (!cells.length) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function rowHtml(
  cells: string[],
  tag: "th" | "td",
  mapCell?: (cell: string) => string,
): string {
  return `<tr>${cells
    .map((c) => {
      const raw = mapCell ? mapCell(c) : c;
      // 已含公式 HTML 时不再 escape 标签；纯文本仍 escape
      const html = /data-type\s*=\s*["']math-/i.test(raw)
        ? raw
        : escapeHtml(raw);
      return `<${tag}>${html}</${tag}>`;
    })
    .join("")}</tr>`;
}

/**
 * 把 Markdown 管道表转成 HTML table；保留非表内容。
 * mapCell：可选，对单元格文本做公式规范化后再写入。
 */
export function convertGfmTablesToHtml(
  md: string,
  mapCell?: (cell: string) => string,
): string {
  if (!md || !md.includes("|")) return md;
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const next = lines[i + 1];
    if (
      line.includes("|") &&
      next &&
      isSepRow(next) &&
      splitRow(line).length >= 2
    ) {
      const header = splitRow(line);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length) {
        const row = lines[i]!;
        if (!row.includes("|") || !row.trim()) break;
        if (isSepRow(row)) {
          i += 1;
          continue;
        }
        const cells = splitRow(row);
        if (cells.length < 1) break;
        while (cells.length < header.length) cells.push("");
        body.push(cells.slice(0, header.length));
        i += 1;
      }
      const thead = `<thead>${rowHtml(header, "th", mapCell)}</thead>`;
      const tbody = `<tbody>${body
        .map((c) => rowHtml(c, "td", mapCell))
        .join("")}</tbody>`;
      out.push(`<table>\n${thead}\n${tbody}\n</table>`);
      continue;
    }
    out.push(line);
    i += 1;
  }
  return out.join("\n");
}
