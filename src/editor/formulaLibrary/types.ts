/** 万构公式库条目（由 HuiTurn/Formula 转换） */

export type FormulaLibCat =
  | "math"
  | "physics"
  | "chemistry"
  | "statistics"
  | "engineering"
  | "finance"
  | "misc";

export type FormulaLibItem = {
  id: string;
  name: string;
  cat: FormulaLibCat;
  categoryZh: string;
  sub: string;
  grade: string;
  latex: string;
  text: string;
  tags: string[];
  keywords: string;
};

export const FORMULA_LIB_CATS: FormulaLibCat[] = [
  "math",
  "physics",
  "chemistry",
  "statistics",
  "engineering",
  "finance",
];

/** 与 HuiTurn/Formula 学段对齐（筛选用包含匹配） */
export const FORMULA_LIB_GRADES = [
  "小学",
  "初中",
  "高中",
  "大学",
  "专业领域",
] as const;

export type FormulaLibGrade = (typeof FORMULA_LIB_GRADES)[number];
