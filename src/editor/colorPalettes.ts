/**
 * Word 风格色板：主题色（列 × 深浅）+ 标准色；荧光笔用浅色档。
 */

/** 主题色：每列 [主题色, 由浅到深 5 档] —— 与 Word「主题颜色」网格相近 */
export const THEME_COLOR_COLUMNS: string[][] = [
  ["#ffffff", "#f2f2f2", "#d9d9d9", "#bfbfbf", "#a6a6a6", "#7f7f7f"],
  ["#000000", "#7f7f7f", "#595959", "#404040", "#262626", "#0d0d0d"],
  ["#e7e6e6", "#d0cece", "#aeabab", "#757070", "#3b3838", "#161616"],
  ["#44546a", "#d6dce4", "#adb9ca", "#8496b0", "#323f4f", "#222a35"],
  ["#5b9bd5", "#deebf6", "#bdd7ee", "#9dc3e6", "#2e75b6", "#1f4e79"],
  ["#ed7d31", "#fce4d6", "#f8cbad", "#f4b183", "#c55a11", "#833c0c"],
  ["#a5a5a5", "#ededed", "#dbdbdb", "#c9c9c9", "#7b7b7b", "#525252"],
  ["#ffc000", "#fff2cc", "#ffe699", "#ffd966", "#bf9000", "#7f6000"],
  ["#4472c4", "#d6dce4", "#b4c6e7", "#8faadc", "#2f5496", "#1f3864"],
  ["#70ad47", "#e2efd9", "#c5e0b3", "#a8d08d", "#548235", "#375623"],
];

/** 标准色一行 */
export const STANDARD_COLORS: string[] = [
  "#c00000",
  "#ff0000",
  "#ffc000",
  "#ffff00",
  "#92d050",
  "#00b050",
  "#00b0f0",
  "#0070c0",
  "#002060",
  "#7030a0",
];

/** 荧光笔浅色（多档） */
export const HIGHLIGHT_COLORS: string[] = [
  "#ffff00",
  "#00ff00",
  "#00ffff",
  "#ff00ff",
  "#0000ff",
  "#ff0000",
  "#000080",
  "#008080",
  "#008000",
  "#800080",
  "#800000",
  "#808000",
  "#ff99cc",
  "#ffcc99",
  "#ffff99",
  "#ccffcc",
  "#ccffff",
  "#99ccff",
  "#cc99ff",
  "#f2f2f2",
];

export const FONT_OPTIONS: { value: string; labelZh: string; labelEn: string }[] =
  [
    { value: "", labelZh: "默认", labelEn: "Default" },
    {
      value: '"Microsoft YaHei", "PingFang SC", sans-serif',
      labelZh: "微软雅黑",
      labelEn: "Microsoft YaHei",
    },
    {
      value: 'SimSun, "Songti SC", serif',
      labelZh: "宋体",
      labelEn: "SimSun",
    },
    {
      value: 'SimHei, "Heiti SC", sans-serif',
      labelZh: "黑体",
      labelEn: "SimHei",
    },
    {
      value: 'KaiTi, "Kaiti SC", serif',
      labelZh: "楷体",
      labelEn: "KaiTi",
    },
    {
      value: 'FangSong, "STFangsong", serif',
      labelZh: "仿宋",
      labelEn: "FangSong",
    },
    { value: "Arial, sans-serif", labelZh: "Arial", labelEn: "Arial" },
    {
      value: '"Times New Roman", Times, serif',
      labelZh: "Times New Roman",
      labelEn: "Times New Roman",
    },
    { value: "Georgia, serif", labelZh: "Georgia", labelEn: "Georgia" },
    {
      value: 'Consolas, "Courier New", monospace',
      labelZh: "Consolas",
      labelEn: "Consolas",
    },
  ];

export const FONT_SIZES = ["12", "14", "16", "18", "20", "24", "28", "36"] as const;
