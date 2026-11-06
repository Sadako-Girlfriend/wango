/**
 * 段落级正文 diff：用于 AI 写入后的红绿提示。
 * 单位：空行分隔的块（表格/列表整块当作一段）。
 */

export type DiffOp =
  | { type: "equal"; text: string }
  | { type: "add"; text: string }
  | { type: "del"; text: string };

/** 按空行切段；保留段内换行 */
export function splitContentBlocks(md: string): string[] {
  const text = String(md ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  return text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
}

function lcsTable(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        a[i] === b[j] ? (dp[i + 1]![j + 1]! + 1) : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  return dp;
}

/** 段落 LCS → equal / add / del 序列 */
export function diffContentBlocks(oldMd: string, newMd: string): DiffOp[] {
  const a = splitContentBlocks(oldMd);
  const b = splitContentBlocks(newMd);
  if (!a.length && !b.length) return [];
  if (!a.length) return b.map((text) => ({ type: "add" as const, text }));
  if (!b.length) return a.map((text) => ({ type: "del" as const, text }));

  const dp = lcsTable(a, b);
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ type: "equal", text: a[i]! });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: "del", text: a[i]! });
      i += 1;
    } else {
      ops.push({ type: "add", text: b[j]! });
      j += 1;
    }
  }
  while (i < a.length) {
    ops.push({ type: "del", text: a[i]! });
    i += 1;
  }
  while (j < b.length) {
    ops.push({ type: "add", text: b[j]! });
    j += 1;
  }
  return ops;
}

function wrapDiff(kind: "add" | "del", body: string): string {
  // 用 div，勿用 del/ins：StarterKit Strike 会把裸 <del> 收成行内删除线，
  // DiffDel 块挂不上，「接受改动」也不出现。
  return `<div data-wg-diff="${kind}">\n\n${body}\n\n</div>`;
}

/** 相邻同类型段合并成一块（多段删/增多框 → 单框） */
export function coalesceDiffOps(ops: DiffOp[]): DiffOp[] {
  const out: DiffOp[] = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (last && last.type === op.type) {
      last.text = `${last.text}\n\n${op.text}`;
    } else {
      out.push({ type: op.type, text: op.text });
    }
  }
  return out;
}

/**
 * 旧→新 拼出带红绿标记的 Markdown。
 * 旧文为空时直接返回新文（新建不标绿）。
 * 无实际增删时返回新文。
 */
export function annotateContentDiff(oldMd: string, newMd: string): string {
  const oldT = String(oldMd ?? "").trim();
  const newT = String(newMd ?? "").trim();
  if (!oldT) return newT;
  if (oldT === newT) return newT;

  const ops = coalesceDiffOps(diffContentBlocks(oldT, newT));
  const hasChange = ops.some((o) => o.type === "add" || o.type === "del");
  if (!hasChange) return newT;

  return ops
    .map((op) => {
      if (op.type === "equal") return op.text;
      if (op.type === "add") return wrapDiff("add", op.text);
      return wrapDiff("del", op.text);
    })
    .join("\n\n");
}

/** 接受改动：去掉标记（绿留内容，红整段删） */
export function stripDiffAnnotations(md: string): string {
  if (!md) return md;
  let out = md.replace(/\r\n/g, "\n");
  // 删除块
  out = out.replace(
    /<del\b[^>]*\bdata-wg-diff\s*=\s*["']del["'][^>]*>[\s\S]*?<\/del>/gi,
    "",
  );
  out = out.replace(
    /<div\b[^>]*\bdata-wg-diff\s*=\s*["']del["'][^>]*>[\s\S]*?<\/div>/gi,
    "",
  );
  // 解开新增壳
  out = out.replace(
    /<ins\b[^>]*\bdata-wg-diff\s*=\s*["']add["'][^>]*>\s*([\s\S]*?)\s*<\/ins>/gi,
    "$1",
  );
  out = out.replace(
    /<div\b[^>]*\bdata-wg-diff\s*=\s*["']add["'][^>]*>\s*([\s\S]*?)\s*<\/div>/gi,
    "$1",
  );
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export function markdownHasDiffAnnotations(md: string): boolean {
  return /data-wg-diff\s*=\s*["'](add|del)["']/i.test(md);
}
