/**
 * io 层出口：.wango 读写与校验。
 * 现行格式为 ZIP（project.json + 可选 attachments/）；纯 JSON 仅导入兼容。
 */

export {
  CURRENT_WANGO_VERSION,
  isWangoFile,
  isProjectData,
  migrateWangoFile,
} from "./schema";

export { encodeJsonWango, decodeJsonWango } from "./jsonCodec";

export {
  encodePackageWango,
  decodePackageWango,
  decodeWangoBytes,
  looksLikeZip,
  type AttachmentBlob,
} from "./packageCodec";
