/**
 * 使用指南示例正文（随版本功能更新）。
 * 改完后「从模板新建 → 使用指南」即用新内容；旧已打开的标签不会自动变。
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
        "万构用来把复杂事情**拆成树**：万物皆可解构，万物皆有结构。\n\n本示例既是教程，也演示了常用富文本。建议按编号从左树点开每一节。\n\n<aside data-type=\"callout\" class=\"wg-callout\">\n<p><strong>备注：</strong>黄底块适合写提醒、约定、易错点。工具栏灯泡可插入 / 取消。</p>\n</aside>\n\n右下角可挂 PDF、压缩包等附件；**图片请放正文**（工具栏或拖入）。\n\n顶栏还可打开 **Agent**（改稿助手）、**灵感**（生成树）、以及「从粘贴 / 从文件新建」。",
    },
    {
      title: "左侧：树怎么用",
      content:
        "### 常用操作\n\n1. **子节点 / 同级**：在当前节点下加一层，或加兄弟\n2. **升级 / 降级**：调整层级（也可拖拽）\n3. **拖拽**：拖到节点上半 / 下半 / 中间，分别是前插、后插、收为子节点\n4. **定位**：树顶搜索按标题过滤，Enter 跳下一个命中\n5. **折叠**：点 ▸ / ▾，只管显示，不影响存盘结构\n6. **右键菜单**：优先级、文字标签、复制粘贴、引用/复制到词表等\n\n编号（1、1.1、1.1.1）会随拖拽自动重算，**不用手改**。\n\n侧栏可以**拖宽或收窄**；收起后换项目标签会自动展开。",
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
        "上方大字是**节点标题**（对应左树这一行），下面才是正文。\n\n编辑区上方有 **已打开** 页签：可在多个节点间切换，脏页关闭前会提醒保存。\n\n# 一级标题（工具栏「标题 1」）\n\n## 二级标题（工具栏「标题 2」）\n\n这是普通**正文**段落。可以混用 *斜体*、***粗斜体***、以及 <u>下划线</u>。\n\n字色示例：<span style=\"color: #dc2626\">强调红</span>、<span style=\"color: #2f6fed\">链接蓝</span>、<span style=\"color: #059669\">成功绿</span>。\n\n高亮示例：<mark data-color=\"#fef08a\" style=\"background-color: #fef08a; color: inherit\">黄底高亮</mark>、<mark data-color=\"#bbf7d0\" style=\"background-color: #bbf7d0; color: inherit\">绿底高亮</mark>。\n\n字体与字号：<span style=\"font-family: Georgia, serif\">衬线一段</span>；<span style=\"font-size: 18px\">18px 略大</span>；<span style=\"font-size: 12px\">12px 略小</span>。",
    },
    {
      title: "代码块与备注",
      content:
        "代码块带语言标、复制、行号；过长可展开。工具栏 `<>` 插入。\n\n```css\n:root {\n  --wg-accent: #2f6fed;\n  --wg-bg: #f7f8fa;\n  --wg-font: \"Segoe UI\", \"PingFang SC\", sans-serif;\n}\n\n.title {\n  font-weight: 700;\n  letter-spacing: -0.02em;\n}\n```\n\n```javascript\nfunction greet(name) {\n  return `你好，${name}！欢迎用万构拆结构。`;\n}\n\nconsole.log(greet(\"同学\"));\n```\n\n<aside data-type=\"callout\"><p><strong>备注：</strong>备注块适合放「注意 / 待确认 / 例外」。Agent / 灵感写入正文时也可以带备注块。</p></aside>",
    },
    {
      title: "词表库",
      content:
        "左下角 **词表库**：把大纲里的设定名、专有名词收成词条，方便正文引用。\n\n### 常用\n\n1. 树节点右键 → **引用为词条** / **复制为词条**\n2. 词表区可新建独立词条，写释义\n3. 正文里点到命中词可看引用；可手动绑定 / 解绑\n4. 改名、黑名单、审查日志在词表相关面板里\n\n<aside data-type=\"callout\" class=\"wg-callout\">\n<p><strong>备注：</strong>Agent 应用改稿后会自动扫一遍引用；不必手写 link id。</p>\n</aside>",
    },
    {
      title: "Agent 改稿助手",
      content:
        "顶栏打开 **Agent**。它会带上**当前项目全书**（树 + 词表），用对话帮你改大纲。\n\n### 怎么用\n\n1. 在左侧点选焦点节点（可选，方便它对准）\n2. 用自然语言提要求，例如：「给当前节点补一节教学目标」\n3. 若要改稿，回复末尾会出现 **提案卡**——点「应用」才写入，不会偷偷改\n4. 多条提案时，输入框上方有审阅条：**全部跳过 / 全部应用**（会先建父节点再建子节点）\n5. **+ 新对话** 会新开标签，旧对话还在；可切换、关闭\n\n### 提案能做什么\n\n- 改已有节点的标题 / 正文（Markdown，可含代码块、备注块）\n- **新建子节点**、新建词条\n\n### 和「保存」的关系\n\n- 日常 **Ctrl+S** 默认**不把** Agent 对话打进 `.wango`\n- 导出另存时勾选 **包含 Agent 对话**，对话才会进包；改文件名后再打开也能恢复\n\n需在 **设置** 里配置兼容 OpenAI 的 API（与灵感共用）。",
    },
    {
      title: "保存、打开与导出",
      content:
        "### 本地优先\n\n- **保存 / Ctrl+S**：有路径则覆盖，否则另存为 `.wango`\n- **打开**：`.wango`（ZIP：`project.json` + 可选附件）；也兼容老版纯 JSON\n- 多项目用顶栏**选项卡**；编辑中可用 **其他项目** 打开已保存文件，不必先回首页\n\n### 新建入口\n\n- **从模板新建**：空项目 / 本使用指南\n- **从粘贴新建**：粘贴带序号的大纲，本地拆分或 AI 整理后新开项目\n- **从文件新建**：`.docx` / `.md` 按标题建树后新开项目\n\n### 导出\n\n- **喂给 AI（Markdown）**、思维导图 PNG、长图 PDF / 图片、Word 等\n- **另存完整 `.wango`**：可选是否 **包含 Agent 对话**\n\n文件菜单里也能「打开 / 保存 / 导出」。",
    },
    {
      title: "灵感生成（可选）",
      content:
        "顶栏 **灵感** 与 Agent 不同：灵感偏「生成 / 扩一棵树」，Agent 偏「对着现有项目改稿」。\n\n1. **完善框架**：基于当前树补全润色（结果在新标签，不改原稿）\n2. **一句话生成**：一句话拆出整棵树\n3. **只生成框架**：只要标题骨架，正文留给你填\n\n需在 **设置** 里配置 API。生成中可悬停按钮取消。\n\n<aside data-type=\"callout\" class=\"wg-callout\">\n<p><strong>备注：</strong>离线也能完整使用写 / 存 / 出；灵感与 Agent 都是增强，不是必选项。</p>\n</aside>",
    },
    {
      title: "快捷键与审查统计",
      content:
        "- **设置 → 快捷键**：可录制、查冲突、恢复默认（如树操作、焦点切换等）\n- **审查统计（默认 F10）**：字数、标点、代码块、备注等，可按全书 / 当前节点 / 选区看\n\n把常用操作记进肌肉记忆，拆大纲会快很多。",
    },
    {
      title: "动手清单",
      content:
        "按这个顺序玩一遍，基本就上手了：\n\n- [ ] 拖拽调整「试试拖我」的位置\n- [ ] 给本节点加一个子节点并写两句正文\n- [ ] 插入一段代码块，点右上角复制\n- [ ] 插入一个备注块\n- [ ] 打开左下词表，给某个节点「引用为词条」\n- [ ] 打开 Agent，问一句「帮我给某节点加一句摘要」（有 API 时）；看提案卡与底部审阅条\n- [ ] 另存为 `.wango`，再打开确认\n- [ ] 导出一次「喂给 AI」的 Markdown\n\n然后就可以 **从模板新建 → 空项目**，开始你自己的解构。",
    },
  ],
};
