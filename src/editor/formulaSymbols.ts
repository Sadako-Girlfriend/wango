/**
 * 符号面板分类与插入用 LaTeX。
 * 结构类用 \\placeholder{}，便于嵌套：先根号再分数 → √(□/□)。
 */

export type FormulaSymbol = {
  /** 按钮主显示（符号） */
  label: string;
  latex: string;
  /** i18n 键后缀；结构类会作为按钮副标题显示 */
  titleKey?: string;
  /** 结构类：副标题更醒目 */
  showCaption?: boolean;
};

export type FormulaCategoryId =
  | "structure"
  | "greek"
  | "ops"
  | "relations"
  | "misc";

export type FormulaCategory = {
  id: FormulaCategoryId;
  symbols: FormulaSymbol[];
};

const ph = "\\placeholder{}";

export const FORMULA_CATEGORIES: FormulaCategory[] = [
  {
    id: "structure",
    symbols: [
      { label: "√□", latex: `\\sqrt{${ph}}`, titleKey: "sqrt", showCaption: true },
      {
        label: "ⁿ√□",
        latex: `\\sqrt[${ph}]{${ph}}`,
        titleKey: "nthRoot",
        showCaption: true,
      },
      {
        label: "□/□",
        latex: `\\frac{${ph}}{${ph}}`,
        titleKey: "frac",
        showCaption: true,
      },
      { label: "□²", latex: `{${ph}}^{${ph}}`, titleKey: "sup", showCaption: true },
      { label: "□ₙ", latex: `{${ph}}_{${ph}}`, titleKey: "sub", showCaption: true },
      {
        label: "∫",
        latex: `\\int_{${ph}}^{${ph}}{${ph}}`,
        titleKey: "int",
        showCaption: true,
      },
      {
        label: "∑",
        latex: `\\sum_{${ph}}^{${ph}}{${ph}}`,
        titleKey: "sum",
        showCaption: true,
      },
      {
        label: "∏",
        latex: `\\prod_{${ph}}^{${ph}}{${ph}}`,
        titleKey: "prod",
        showCaption: true,
      },
      {
        label: "lim",
        latex: `\\lim_{${ph}}{${ph}}`,
        titleKey: "lim",
        showCaption: true,
      },
      { label: "(□)", latex: `\\left(${ph}\\right)`, titleKey: "paren", showCaption: true },
      { label: "[□]", latex: `\\left[${ph}\\right]`, titleKey: "bracket", showCaption: true },
      {
        label: "{□}",
        latex: `\\left\\{${ph}\\right\\}`,
        titleKey: "brace",
        showCaption: true,
      },
      { label: "|□|", latex: `\\left|${ph}\\right|`, titleKey: "abs", showCaption: true },
      { label: "⃗", latex: `\\vec{${ph}}`, titleKey: "vec", showCaption: true },
      { label: "¯", latex: `\\overline{${ph}}`, titleKey: "over", showCaption: true },
      {
        label: "▭",
        latex: `\\begin{pmatrix}${ph}&${ph}\\\\${ph}&${ph}\\end{pmatrix}`,
        titleKey: "matrix",
        showCaption: true,
      },
    ],
  },
  {
    id: "greek",
    symbols: [
      { label: "α", latex: "\\alpha" },
      { label: "β", latex: "\\beta" },
      { label: "γ", latex: "\\gamma" },
      { label: "δ", latex: "\\delta" },
      { label: "ε", latex: "\\varepsilon" },
      { label: "θ", latex: "\\theta" },
      { label: "λ", latex: "\\lambda" },
      { label: "μ", latex: "\\mu" },
      { label: "π", latex: "\\pi" },
      { label: "σ", latex: "\\sigma" },
      { label: "φ", latex: "\\varphi" },
      { label: "ω", latex: "\\omega" },
      { label: "Δ", latex: "\\Delta" },
      { label: "Σ", latex: "\\Sigma" },
      { label: "Ω", latex: "\\Omega" },
    ],
  },
  {
    id: "ops",
    symbols: [
      { label: "±", latex: "\\pm" },
      { label: "∓", latex: "\\mp" },
      { label: "×", latex: "\\times" },
      { label: "÷", latex: "\\div" },
      { label: "·", latex: "\\cdot" },
      { label: "∗", latex: "\\ast" },
      { label: "∘", latex: "\\circ" },
      { label: "⊕", latex: "\\oplus" },
      { label: "⊗", latex: "\\otimes" },
      { label: "∂", latex: "\\partial" },
      { label: "∇", latex: "\\nabla" },
      { label: "∞", latex: "\\infty" },
    ],
  },
  {
    id: "relations",
    symbols: [
      { label: "≠", latex: "\\neq" },
      { label: "≈", latex: "\\approx" },
      { label: "≡", latex: "\\equiv" },
      { label: "≤", latex: "\\leq" },
      { label: "≥", latex: "\\geq" },
      { label: "≪", latex: "\\ll" },
      { label: "≫", latex: "\\gg" },
      { label: "∈", latex: "\\in" },
      { label: "∉", latex: "\\notin" },
      { label: "⊂", latex: "\\subset" },
      { label: "⊆", latex: "\\subseteq" },
      { label: "∪", latex: "\\cup" },
      { label: "∩", latex: "\\cap" },
      { label: "→", latex: "\\to" },
      { label: "⇒", latex: "\\Rightarrow" },
      { label: "⇔", latex: "\\Leftrightarrow" },
    ],
  },
  {
    id: "misc",
    symbols: [
      { label: "∠", latex: "\\angle" },
      { label: "°", latex: "{{}^\\circ}" },
      { label: "′", latex: "'" },
      { label: "″", latex: "''" },
      { label: "…", latex: "\\dots" },
      { label: "⋯", latex: "\\cdots" },
      { label: "ℝ", latex: "\\mathbb{R}" },
      { label: "ℕ", latex: "\\mathbb{N}" },
      { label: "ℤ", latex: "\\mathbb{Z}" },
      { label: "ℚ", latex: "\\mathbb{Q}" },
      { label: "ℂ", latex: "\\mathbb{C}" },
      { label: "⊥", latex: "\\perp" },
      { label: "∥", latex: "\\parallel" },
      { label: "∴", latex: "\\therefore" },
      { label: "∵", latex: "\\because" },
    ],
  },
];
