/**
 * 领域类型定义。
 * 与 UI / Tauri / TipTap 解耦；编号不入库，由 numbering 派生。
 */

/** 附件元数据：只存包内相对路径，不存本机绝对盘符 */
export interface AttachmentMeta {
  id: string;
  name: string;
  mime: string;
  /** 包内相对路径，如 attachments/<id>/file.pdf */
  relPath: string;
}

/** 优先级：仅标记，不参与排序；缺省 / null = 无 */
export type NodePriority = "high" | "medium" | "low";

/** 树节点：content 为 Markdown */
export interface TreeNode {
  id: string;
  title: string;
  content: string;
  children: TreeNode[];
  attachments: AttachmentMeta[];
  /** 优先级标记，不改变同级顺序 */
  priority?: NodePriority | null;
  /** 文字标签（可多个），类似 XMind Label */
  labels?: string[];
}

/**
 * 词表项种类：
 * - ref：大纲节点投影（同源 id，改大纲即改词条展示）
 * - copy：从大纲深拷后的独立副本
 * - local：在词表区新建的独立词条
 */
export type GlossaryKind = "ref" | "copy" | "local";

export interface GlossaryNode {
  id: string;
  kind: GlossaryKind;
  /** 仅 ref：指向大纲 TreeNode.id；源删后物化时清空 */
  sourceNodeId?: string;
  /** copy/local 自有；ref 打开时以大纲为准，物化后固化在此 */
  title: string;
  content: string;
  children: GlossaryNode[];
  /** 改名且不替换正文时，旧称进此数组，扫链仍能命中 */
  aliases: string[];
  /** 词条专属黑名单：语境含这些短语则自动拦截建链 */
  blacklist: string[];
  /**
   * 历次改名（含是否同步正文都记），供引用记录标注
   * 「已改名 / 改名后新引用」及二次、三次改名。
   */
  renameHistory: GlossaryRenameEvent[];
  /**
   * 正文引用高亮色（#rrggbb）；缺省走主题强调色。
   * 仅影响本词条的引用装饰与词表行色点，不改 Markdown。
   */
  color?: string;
}

/** 词条标题改名事件 */
export interface GlossaryRenameEvent {
  from: string;
  to: string;
  at: string;
}

export type GlossaryLinkStatus =
  | "active"
  | "removed"
  | "modified"
  | "revoked"
  | "blocked"
  | "yielded";

/**
 * 引用来源：
 * - auto：扫链疑似提及（入库、审查可见，正文不高亮）
 * - manual：用户绑定（可高亮；支持多绑 / 解绑）
 * 旧数据缺省视为 auto。
 */
export type GlossaryLinkSource = "auto" | "manual";

/** 正文中的词条引用区间（相对 host 节点 content 字符偏移） */
export interface GlossaryLink {
  id: string;
  entryId: string;
  hostNodeId: string;
  start: number;
  end: number;
  matchedText: string;
  /**
   * 建链时命中的原文（首次写入后不随同步改名覆盖）。
   * 用来区分「旧名时期的引用」与「改名后新引用」。
   */
  originText?: string;
  /**
   * 手动绑定锚文字（对齐用）；缺省回退 matchedText。
   * 自动链可不写。
   */
  anchorText?: string;
  /**
   * 手动绑定时：锚文字在编辑器纯文本中的第几次出现（0-based）。
   * 装饰层用来把同名多处画到选中的那一次，而不是总吃第一处。
   */
  occurrenceIndex?: number;
  /** 缺省 auto */
  source?: GlossaryLinkSource;
  status: GlossaryLinkStatus;
  reason?: string;
  updatedAt: string;
}

/**
 * 审计/日志事件（接口先留稳；UI 可后补）。
 * 既有 ref/edit 继续用；手动绑解绑也写入 message。
 */
export type GlossaryLogKind = "ref" | "edit";

export interface GlossaryLog {
  id: string;
  entryId: string;
  kind: GlossaryLogKind;
  status: GlossaryLinkStatus | "rename";
  hostNodeId?: string;
  before?: string;
  after?: string;
  message: string;
  at: string;
  linkId?: string;
}

/** 项目根数据：对应 .wango 内 projectData */
export interface ProjectData {
  /** 项目显示名（与磁盘文件名独立；改名不重命名 .wango） */
  name: string;
  tree: TreeNode[];
  glossary: GlossaryNode[];
  glossaryLinks: GlossaryLink[];
  glossaryLogs: GlossaryLog[];
}

/** Agent 提案目标：大纲树或词表 */
export type AgentProposalTarget = "tree" | "glossary";

/** 改已有节点标题/正文 */
export interface AgentProposalSet {
  id: string;
  op: "set";
  target: AgentProposalTarget;
  nodeId: string;
  field: "title" | "content";
  next: string;
  note?: string;
}

/** 在父节点下新建子节点（词表 parentId 为空则挂根） */
export interface AgentProposalAddChild {
  id: string;
  op: "addChild";
  target: AgentProposalTarget;
  parentId: string | null;
  title: string;
  content?: string;
  note?: string;
}

/** Agent 改稿提案（需用户确认后写入） */
export type AgentProposal = AgentProposalSet | AgentProposalAddChild;

export type AgentProposalStatus = "pending" | "applied" | "skipped";

/** 按项目存的 Agent 对话（可选打进 .wango） */
export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
  /** 思考/推理过程（可折叠展示；多轮请求一般不回传） */
  thinking?: string;
  /** 助手消息可附带改稿提案 */
  proposals?: AgentProposal[];
  proposalStatus?: Record<string, AgentProposalStatus>;
}

/** 单个对话标签页 */
export interface AgentChat {
  id: string;
  title: string;
  messages: AgentMessage[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 旧版单线程（无标签）。读取时升级为 AgentSession。
 * @deprecated 仅兼容旧缓存 / 旧包
 */
export interface AgentThread {
  version: 1;
  messages: AgentMessage[];
  updatedAt: string;
}

/** 某项目下的多标签 Agent 会话（本机缓存与导出） */
export interface AgentSession {
  version: 2;
  activeChatId: string;
  chats: AgentChat[];
  updatedAt: string;
}

/** .wango ZIP 包内 project.json 的外壳结构 */
export interface WangoFile {
  wangoVersion: string;
  exportedAt: string;
  projectData: ProjectData;
  /** 导出时可选包含的 Agent 对话（v2 多标签或旧 v1 单线程） */
  agent?: AgentSession | AgentThread;
}

/** 带展示编号的只读视图节点（不写回持久化） */
export interface NumberedTreeNode extends TreeNode {
  number: string;
  children: NumberedTreeNode[];
}

/** 在树中定位节点时的路径信息 */
export interface NodeLocation {
  node: TreeNode;
  parent: TreeNode | null;
  index: number;
  /** 从根到该节点的 id 路径（含自身） */
  pathIds: string[];
}

/** 词表树定位 */
export interface GlossaryLocation {
  node: GlossaryNode;
  parent: GlossaryNode | null;
  index: number;
  pathIds: string[];
}
