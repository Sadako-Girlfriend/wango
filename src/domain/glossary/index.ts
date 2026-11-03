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
} from "./tree";

export {
  collectTerms,
  matchLongest,
  reconcileHostLinks,
  scanProjectLinks,
  countActiveLinks,
  replaceRanges,
  snippetAround,
  type GlossaryTerm,
  type MatchHit,
  type ReconcileResult,
} from "./match";

export {
  titleLineage,
  renameNoteForLink,
  type GlossaryRenameNote,
  type GlossaryRenameNoteKind,
} from "./renameNote";

export {
  collectGlossaryBodyPreviews,
  collectGlossaryColors,
  collectGlossaryTitles,
  glossaryLinkStyle,
  isGlossaryColor,
  plainBodyPreview,
} from "./colors";

export {
  createManualLink,
  findLooseInMarkdown,
  findNthOccurrence,
  isAutoLink,
  isManualLink,
  linkSourceOf,
  locateAnchorInHost,
  occurrenceIndexBefore,
  realignManualLink,
  shouldHighlightLink,
} from "./linkSource";
