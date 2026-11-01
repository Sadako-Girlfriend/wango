/**
 * 导出右栏静态示例：示意产物形态，不读当前项目。
 */

import { useI18n } from "@/i18n/useI18n";
import logo2 from "@/assets/logo-2.jpg";
import styles from "./ExportDialog.module.css";

type SampleKind = "ai" | "mindmap" | "wango-as" | "pdf" | "images";

type Props = {
  kind: SampleKind;
  /** 图片：随单张/多张切换示意 */
  imageMulti?: boolean;
};

export function ExportSamplePreview({ kind, imageMulti = false }: Props) {
  const { t } = useI18n();

  return (
    <div className={styles.sample} aria-hidden>
      <div className={styles.sampleBadge}>{t("export.sampleBadge")}</div>
      {kind === "ai" && <SvgMarkdown />}
      {kind === "pdf" && <SvgPdf />}
      {kind === "mindmap" && <SvgMindmap />}
      {kind === "images" && (imageMulti ? <SvgImagesMulti /> : <SvgImagesLong />)}
      {kind === "wango-as" && <SvgWango />}
    </div>
  );
}

/** Markdown：等宽标题层级示意 */
function SvgMarkdown() {
  return (
    <svg
      className={styles.sampleSvg}
      viewBox="0 0 220 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="8"
        y="8"
        width="204"
        height="112"
        rx="8"
        className={styles.svgSurface}
      />
      <text x="20" y="36" className={styles.svgCodeAccent}>
        # 1 Title
      </text>
      <text x="20" y="54" className={styles.svgCodeMuted}>
        body text for AI…
      </text>
      <text x="20" y="78" className={styles.svgCodeAccent}>
        ## 1.1 Section
      </text>
      <text x="20" y="96" className={styles.svgCodeMuted}>
        ### 1.1.1 Detail
      </text>
    </svg>
  );
}

/** PDF：无分页长文档剪影 */
function SvgPdf() {
  return (
    <svg
      className={styles.sampleSvg}
      viewBox="0 0 220 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="62"
        y="6"
        width="96"
        height="116"
        rx="4"
        className={styles.svgPaper}
      />
      <path d="M134 6v22h22" className={styles.svgFold} />
      <path d="M134 6l22 22" className={styles.svgFoldEdge} />
      <rect x="74" y="18" width="28" height="12" rx="2" className={styles.svgAccent} />
      <text x="78" y="27" className={styles.svgPdfLabel}>
        PDF
      </text>
      <rect x="74" y="40" width="72" height="5" rx="1.5" className={styles.svgLine} />
      <rect x="74" y="50" width="64" height="5" rx="1.5" className={styles.svgLine} />
      <rect x="74" y="60" width="48" height="5" rx="1.5" className={styles.svgLine} />
      <rect x="74" y="74" width="56" height="5" rx="1.5" className={styles.svgLine} />
      <rect x="74" y="84" width="68" height="5" rx="1.5" className={styles.svgLine} />
      <rect x="74" y="94" width="40" height="5" rx="1.5" className={styles.svgLine} />
      <text x="158" y="64" className={styles.svgSideTag}>
        ∞
      </text>
    </svg>
  );
}

/** 思维导图：左→右 */
function SvgMindmap() {
  return (
    <svg
      className={styles.sampleSvg}
      viewBox="0 0 220 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="12" y="50" width="52" height="28" rx="6" className={styles.svgAccent} />
      <text x="38" y="68" textAnchor="middle" className={styles.svgOnAccent}>
        Root
      </text>
      <path
        d="M64 64 H88 M88 40 H108 M88 64 H108 M88 88 H108 M108 40 H118 M108 88 H118"
        className={styles.svgWire}
      />
      <rect x="118" y="28" width="48" height="24" rx="5" className={styles.svgChip} />
      <text x="142" y="44" textAnchor="middle" className={styles.svgChipText}>
        1
      </text>
      <rect x="118" y="52" width="48" height="24" rx="5" className={styles.svgChip} />
      <text x="142" y="68" textAnchor="middle" className={styles.svgChipText}>
        2
      </text>
      <rect x="118" y="76" width="48" height="24" rx="5" className={styles.svgChip} />
      <text x="142" y="92" textAnchor="middle" className={styles.svgChipText}>
        2.1
      </text>
      <rect x="176" y="76" width="32" height="24" rx="5" className={styles.svgChipSoft} />
      <path d="M166 88 H176" className={styles.svgWire} />
    </svg>
  );
}

/** 图文：单张长图 */
function SvgImagesLong() {
  return (
    <svg
      className={styles.sampleSvg}
      viewBox="0 0 220 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="70"
        y="4"
        width="80"
        height="120"
        rx="6"
        className={styles.svgPaper}
      />
      <rect x="80" y="14" width="60" height="8" rx="2" className={styles.svgAccent} />
      <rect x="80" y="30" width="60" height="28" rx="3" className={styles.svgPhoto} />
      <circle cx="92" cy="40" r="4" className={styles.svgPhotoHi} />
      <path d="M80 52l12-8 10 6 18-12 20 14v6H80z" className={styles.svgPhotoMt} />
      <rect x="80" y="66" width="60" height="6" rx="1.5" className={styles.svgLine} />
      <rect x="80" y="76" width="48" height="6" rx="1.5" className={styles.svgLine} />
      <rect x="80" y="90" width="60" height="22" rx="3" className={styles.svgPhoto} />
      <path
        d="M4 64 H60 M160 64 H216"
        className={styles.svgWire}
        strokeDasharray="3 3"
      />
    </svg>
  );
}

/** 图文：多张进文件夹 */
function SvgImagesMulti() {
  return (
    <svg
      className={styles.sampleSvg}
      viewBox="0 0 220 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M40 36h40l8 8h92v60H40V36z"
        className={styles.svgFolder}
      />
      <path d="M40 36h36l6 8H40z" className={styles.svgFolderTab} />
      <rect x="52" y="56" width="36" height="36" rx="3" className={styles.svgPaper} />
      <rect x="92" y="56" width="36" height="36" rx="3" className={styles.svgPaper} />
      <rect x="132" y="56" width="36" height="36" rx="3" className={styles.svgPaper} />
      <rect x="58" y="62" width="24" height="14" rx="2" className={styles.svgPhoto} />
      <rect x="98" y="62" width="24" height="14" rx="2" className={styles.svgPhoto} />
      <rect x="138" y="62" width="24" height="14" rx="2" className={styles.svgPhoto} />
      <text x="70" y="86" textAnchor="middle" className={styles.svgTiny}>
        1
      </text>
      <text x="110" y="86" textAnchor="middle" className={styles.svgTiny}>
        1.1
      </text>
      <text x="150" y="86" textAnchor="middle" className={styles.svgTiny}>
        2
      </text>
    </svg>
  );
}

/** .wango 工程包：用品牌 logo2 示意 */
function SvgWango() {
  return (
    <img
      className={styles.sampleLogo}
      src={logo2}
      alt=""
      draggable={false}
    />
  );
}
