/**
 * 由 `D:\wango\万构使用指南.wango` 同步而来的示例正文。
 * 改模板：先改 .wango，再更新本文件（或让我帮你同步）。
 */

export type SampleSeedNode = {
  title: string;
  content: string;
  children?: SampleSeedNode[];
};

export const SAMPLE_GUIDE_SEED: {
  name: string;
  tree: SampleSeedNode[];
} = {
  name: "万构使用指南",
  tree: [
    {
      title: "欢迎使用万构",
      content:
        "万构用来把复杂事情**拆成树**：万物皆可解构，万物皆有结构。\n\n本示例既是教程，也演示了常用富文本。建议按编号从左树点开每一节。\n\n<aside data-type=\"callout\" class=\"wg-callout\">\n<p><strong>备注：</strong>黄底块适合写提醒、约定、易错点。工具栏灯泡可插入 / 取消。</p>\n</aside>\n\n右下角可挂 PDF、压缩包等附件；**图片请放正文**（工具栏或拖入）。",
    },
    {
      title: "左侧：树怎么用",
      content:
        "### 常用操作\n\n1. **子节点 / 同级**：在当前节点下加一层，或加兄弟\n2. **升级 / 降级**：调整层级（也可拖拽）\n3. **拖拽**：拖到节点上半 / 下半 / 中间，分别是前插、后插、收为子节点\n4. **定位**：顶栏搜索按标题过滤，Enter 跳下一个命中\n5. **折叠**：点 ▸ / ▾，只管显示，不影响存盘结构\n\n编号（1、1.1、1.1.1）会随拖拽自动重算，**不用手改**。",
      children: [
        {
          title: "试试拖我",
          content:
            "把本节点拖到「左侧：树怎么用」下面其它位置，看编号如何变化。",
        },
        {
          title: "同级示范 A",
          content: "与上一个节点同级。",
        },
        {
          title: "同级示范 B",
          content: "再拖一次练手。",
        },
      ],
    },
    {
      title: "右侧：标题与段落",
      content:
        "上方大字是**节点标题**（对应左树这一行），下面才是正文。\n\n# 一级标题（工具栏「标题 1」）\n\n## 二级标题（工具栏「标题 2」）\n\n这是普通**正文**段落。可以混用 *斜体*、***粗斜体***、以及 <u>下划线</u>。\n\n字色示例：<span style=\"color: #dc2626\">强调红</span>、<span style=\"color: #2f6fed\">链接蓝</span>、<span style=\"color: #059669\">成功绿</span>。\n\n高亮示例：<mark data-color=\"#fef08a\" style=\"background-color: #fef08a; color: inherit\">黄底高亮</mark>、<mark data-color=\"#bbf7d0\" style=\"background-color: #bbf7d0; color: inherit\">绿底高亮</mark>。\n\n字体与字号：<span style=\"font-family: Georgia, serif\">衬线一段</span>；<span style=\"font-size: 18px\">18px 略大</span>；<span style=\"font-size: 12px\">12px 略小</span>。",
    },
    {
      title: "代码块与备注",
      content:
        "代码块带语言标、复制、行号；过长可展开。工具栏 `<>` 插入。\n\n```css\n:root {\n  --wg-accent: #2f6fed;\n  --wg-bg: #f7f8fa;\n  --wg-font: \"Segoe UI\", \"PingFang SC\", sans-serif;\n}\n\n.title {\n  font-weight: 700;\n  letter-spacing: -0.02em;\n}\n```\n\n```javascript\nfunction greet(name) {\n  return `你好，${name}！欢迎用万构拆结构。`;\n}\n\nconsole.log(greet(\"同学\"));\n```\n\n<aside data-type=\"callout\"><p><strong>备注：</strong>备注块适合放「注意 / 待确认 / 例外」。生成灵感时也会流式出现。</p></aside>",
    },
    {
      title: "保存、打开与导出",
      content:
        "### 本地优先\n\n- **保存 / Ctrl+S**：有路径则覆盖，否则另存为 `.wango`\n- **打开**：`.wango`（ZIP 包：`project.json` + 可选 `attachments/`；也兼容老版纯 JSON）\n- 多项目用**选项卡**，新建 / 打开只加标签，不覆盖正在写的\n\n### 导出\n\n- **喂给 AI（Markdown）**：带层级标题 + 正文，方便丢给大模型\n- **思维导图（图片）**：以项目名为总根，左→右教材风 PNG\n\n文件菜单里也能「另存为 .wango」。",
    },
    {
      title: "灵感生成（可选）",
      content:
        "顶栏 **灵感** 可用来：\n\n1. **完善框架**：基于当前树补全润色（结果在新标签，不改原稿）\n2. **一句话生成**：一句话拆出整棵树\n3. **只生成框架**：只要标题骨架，正文留给你填\n\n需在 **设置** 里配置兼容 AI 的 API。生成中可悬停按钮取消。\n\n<aside data-type=\"callout\" class=\"wg-callout\">\n<p><strong>备注：</strong>离线也能完整使用写 / 存 / 出；灵感是增强，不是必选项。</p>\n</aside>",
    },
    {
      title: "动手清单",
      content:
        "按这个顺序玩一遍，基本就上手了：\n\n- [ ] 拖拽调整「试试拖我」的位置\n- [ ] 给本节点加一个子节点并写两句正文\n- [ ] 插入一段代码块，点右上角复制\n- [ ] 插入一个备注块\n- [ ] 另存为 `.wango`，再打开确认\n- [ ] 导出一次「喂给 AI」的 Markdown\n\n然后就可以 **从模板新建 → 空项目**，开始你自己的解构。",
    },
  ],
};
