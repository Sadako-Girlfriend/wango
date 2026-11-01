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

/** 项目根数据：对应 .wango 内 projectData */
export interface ProjectData {
  /** 项目显示名（与磁盘文件名独立；改名不重命名 .wango） */
  name: string;
  tree: TreeNode[];
}

/** .wango ZIP 包内 project.json 的外壳结构 */
export interface WangoFile {
  wangoVersion: string;
  exportedAt: string;
  projectData: ProjectData;
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
