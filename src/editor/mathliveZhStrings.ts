/**
 * MathLive 自带 zh-cn 缺「插入」子菜单等词条，会回退英文。
 * 通过 MathfieldElement.strings 补全，给国内用户看中文。
 */
export const MATHLIVE_ZH_CN_STRINGS: Record<string, string> = {
  "tooltip.cut to clipboard": "剪切到剪贴板",
  "tooltip.paste from clipboard": "从剪贴板粘贴",
  "tooltip.menu": "菜单",
  "tooltip.fraktur": "哥特体",
  "menu.insert": "插入",
  "menu.insert.abs": "绝对值",
  "menu.insert.nth-root": "n 次根",
  "menu.insert.log-base": "以 a 为底的对数",
  "menu.insert.heading-calculus": "微积分",
  "menu.insert.derivative": "导数",
  "menu.insert.nth-derivative": "n 阶导数",
  "menu.insert.integral": "积分",
  "menu.insert.sum": "求和",
  "menu.insert.product": "求积",
  "menu.insert.heading-complex-numbers": "复数",
  "menu.insert.modulus": "模",
  "menu.insert.argument": "辐角",
  "menu.insert.real-part": "实部",
  "menu.insert.imaginary-part": "虚部",
  "menu.insert.conjugate": "共轭",
  "menu.copy-as-typst": "复制为 Typst",
  // 官方词条笔误：末尾多了 r
  "menu.array.add column after": "在后面添加列",
};
