/**
 * domain 对外出口：UI / store / export / io 只应从这里引用。
 */

export type {
  AgentChat,
  AgentMessage,
  AgentProposal,
  AgentProposalAddChild,
  AgentProposalSet,
  AgentProposalStatus,
  AgentProposalTarget,
  AgentSession,
  AgentThread,
  AttachmentMeta,
  GlossaryKind,
  GlossaryLink,
  GlossaryLinkSource,
  GlossaryLinkStatus,
  GlossaryLocation,
  GlossaryLog,
  GlossaryLogKind,
  GlossaryNode,
  GlossaryRenameEvent,
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
  ensureGlossaryFields,
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
  releaseChildren,
  dissolveNode,
  moveNode,
  moveSibling,
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
  parseNumberedLine,
  extractNumberedHits,
  hitsToForest,
  splitPasteByNumbers,
  wrapImportRoot,
  type PasteSplitHit,
  type PasteSplitResult,
} from "./pasteSplit";

export {
  isLikelyTitleLine,
  extractTitleHits,
  splitPasteByTitles,
  extractBlocksFromHtml,
  splitPasteFromHtml,
  splitPasteByStructure,
  type StructureKind,
  type StructureSplitResult,
  type HtmlPasteBlock,
} from "./pasteStructure";

export {
  splitMarkdownOutline,
  splitDocxOutline,
  detectOutlineFileKind,
  type OutlineFileKind,
} from "./outlineFileImport";

export {
  collectAttachments,
  collectInlineMediaPaths,
  collectAllMediaRelPaths,
  hasAttachments,
} from "./attachments";

export {
  analyzeMarkdown,
  analyzeSelection,
  analyzeScope,
  analyzeNodes,
  flattenNode,
  flattenTree,
  sumContentStats,
  EMPTY_STATS,
  type ContentStats,
  type StatsScope,
} from "./contentStats";

export {
  createGlossaryNode,
  createRefFromTreeNode,
  createCopyFromTreeNode,
  findGlossaryById,
  findGlossaryLocation,
  findGlossaryBySourceId,
  collectRefsToSource,
  collectAllGlossaryIds,
  collectAncestorGlossaryIds,
  updateGlossaryNode,
  addGlossaryChild,
  removeGlossaryNode,
  moveGlossaryNode,
  materializeRefsToSource,
  resolveGlossaryTitle,
  resolveGlossaryContent,
  collectTerms,
  matchLongest,
  reconcileHostLinks,
  scanProjectLinks,
  countActiveLinks,
  replaceRanges,
  snippetAround,
  titleLineage,
  renameNoteForLink,
  collectGlossaryBodyPreviews,
  collectGlossaryColors,
  collectGlossaryTitles,
  glossaryLinkStyle,
  isGlossaryColor,
  plainBodyPreview,
  createManualLink,
  findLooseInMarkdown,
  findNthOccurrence,
  locateAnchorInHost,
  isAutoLink,
  isManualLink,
  linkSourceOf,
  occurrenceIndexBefore,
  realignManualLink,
  shouldHighlightLink,
  type GlossaryTerm,
  type MatchHit,
  type ReconcileResult,
  type GlossaryRenameNote,
  type GlossaryRenameNoteKind,
} from "./glossary";
