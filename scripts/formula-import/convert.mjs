/**
 * 将 HuiTurn/Formula 的 *.js 转成万构公式库 JSON。
 * 源：https://github.com/HuiTurn/Formula （MIT）
 *
 * 用法：node scripts/formula-import/convert.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../../src/editor/formulaLibrary/catalog.json");
const NOTICE = path.resolve(
  __dirname,
  "../../src/editor/formulaLibrary/NOTICE.md",
);

const FILES = [
  "common.js",
  "math.js",
  "physics.js",
  "chemistry.js",
  "statistics.js",
  "engineering.js",
  "finance.js",
  "number-theory.js",
];

/** 学科 → 面板分类 id */
const CAT_MAP = {
  数学: "math",
  物理: "physics",
  化学: "chemistry",
  统计: "statistics",
  工程: "engineering",
  金融: "finance",
  数论: "math",
};

function loadArray(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error(`no array in ${filePath}`);
  return JSON.parse(raw.slice(start, end + 1));
}

function gradeOf(g) {
  if (Array.isArray(g)) return g.join("/");
  return typeof g === "string" ? g : "";
}

function normalize(entry) {
  const latex = String(entry.latex ?? "").trim();
  if (!latex) return null;
  const name = String(entry.name ?? "").trim();
  if (!name) return null;
  const categoryZh = String(entry.category ?? "其它").trim() || "其它";
  const cat = CAT_MAP[categoryZh] ?? "misc";
  const tags = Array.isArray(entry.tags) ? entry.tags.map(String) : [];
  const sub = String(entry.subCategory ?? "").trim();
  const grade = gradeOf(entry.grade);
  const keywords = [name, categoryZh, sub, grade, ...tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return {
    id: String(entry.id ?? `${cat}_${name}`),
    name,
    cat,
    categoryZh,
    sub,
    grade,
    latex,
    text: String(entry.formula ?? "").trim() || name,
    tags,
    keywords,
  };
}

const byId = new Map();
for (const file of FILES) {
  const fp = path.join(__dirname, file);
  if (!fs.existsSync(fp)) {
    console.warn("skip missing", file);
    continue;
  }
  const list = loadArray(fp);
  let n = 0;
  for (const raw of list) {
    const item = normalize(raw);
    if (!item) continue;
    // common.js 优先保留（常在前）
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
      n += 1;
    }
  }
  console.log(`${file}: +${n} (unique total ${byId.size})`);
}

const catalog = [...byId.values()].sort((a, b) => {
  if (a.cat !== b.cat) return a.cat.localeCompare(b.cat);
  return a.name.localeCompare(b.name, "zh");
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(catalog), "utf8");
fs.writeFileSync(
  NOTICE,
  `# 公式库数据来源

本目录 \`catalog.json\` 由 [HuiTurn/Formula](https://github.com/HuiTurn/Formula) 转换生成。

- 许可证：MIT License
- Copyright (c) 2024 Formula Contributors
- 原始 LICENSE 见 \`scripts/formula-import/LICENSE\`

转换脚本：\`scripts/formula-import/convert.mjs\`
`,
  "utf8",
);

console.log(`wrote ${catalog.length} formulas → ${OUT}`);
console.log(
  "by cat:",
  Object.fromEntries(
    [...new Set(catalog.map((x) => x.cat))].map((c) => [
      c,
      catalog.filter((x) => x.cat === c).length,
    ]),
  ),
);
