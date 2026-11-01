/**
 * domain 对外出口：UI / store / export / io 只应从这里引用。
 */

export type {
  AttachmentMeta,
  NodeLocation,
  NodePriority,
  NumberedTreeNode,
  ProjectData,
  TreeNode,
  WangoFile,
} from "./types";

export {
  withNumbering,
  withNumberingFrom,
  getNumberById,
} from "./numbering";

export {
  findNodeById,
  findNodeLocation,
  collectAllIds,
  filterTreeByTitle,
  collectTitleMatches,
  collectAncestorIds,
} from "./selection";

export {
  createId,
  createNode,
  createEmptyProject,
  ensureProjectName,
  normalizePriority,
  normalizeLabels,
  cloneNode,
  cloneNodeWithNewIds,
  updateNode,
  addChild,
  addSiblingAfter,
  duplicateAsSibling,
  removeNode,
  promoteNode,
  demoteNode,
  moveNode,
  isDescendant,
  addAttachment,
  removeAttachment,
} from "./tree";

export {
  flattenVisible,
  resolveDropTarget,
  placementFromRatio,
  type FlatTreeItem,
  type DropPlacement,
  type MoveTarget,
} from "./dragDrop";

export {
  collectAttachments,
  collectInlineMediaPaths,
  collectAllMediaRelPaths,
  hasAttachments,
} from "./attachments";
