/**
 * 懒加载公式库（约数百条，首次点「公式库」再读）。
 */

import type { FormulaLibGrade, FormulaLibItem } from "./types";

let cache: FormulaLibItem[] | null = null;
let loading: Promise<FormulaLibItem[]> | null = null;

export function loadFormulaCatalog(): Promise<FormulaLibItem[]> {
  if (cache) return Promise.resolve(cache);
  if (!loading) {
    loading = import("./catalog.json").then((mod) => {
      const data = (mod as { default: FormulaLibItem[] }).default;
      cache = Array.isArray(data) ? data : [];
      return cache;
    });
  }
  return loading;
}

export type FormulaLibCatFilter = "all" | FormulaLibItem["cat"];
export type FormulaLibGradeFilter = "all" | FormulaLibGrade;

export function filterFormulaCatalog(
  list: FormulaLibItem[],
  opts: {
    cat: FormulaLibCatFilter;
    grade: FormulaLibGradeFilter;
    query: string;
  },
): FormulaLibItem[] {
  const q = opts.query.trim().toLowerCase();
  return list.filter((item) => {
    if (opts.cat !== "all" && item.cat !== opts.cat) return false;
    // 「初中/高中」「大学/积分表」等：包含所选学段即命中
    if (opts.grade !== "all" && !item.grade.includes(opts.grade)) return false;
    if (!q) return true;
    return (
      item.keywords.includes(q) ||
      item.name.toLowerCase().includes(q) ||
      item.text.toLowerCase().includes(q) ||
      item.latex.toLowerCase().includes(q) ||
      item.grade.toLowerCase().includes(q)
    );
  });
}
