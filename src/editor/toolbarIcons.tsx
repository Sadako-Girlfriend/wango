/** 工具栏线性图标（对齐示意图密度，非装饰插画） */

const stroke = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IconBold() {
  return (
    <svg {...stroke}>
      <path d="M7 5h6.5a3.5 3.5 0 0 1 0 7H7V5Z" />
      <path d="M7 12h7.5a3.5 3.5 0 0 1 0 7H7v-7Z" />
    </svg>
  );
}

export function IconItalic() {
  return (
    <svg {...stroke}>
      <path d="M14 5h-4M12 5l-2 14M10 19h4" />
    </svg>
  );
}

export function IconUnderline() {
  return (
    <svg {...stroke}>
      <path d="M7 5v6.5a5 5 0 0 0 10 0V5" />
      <path d="M6 19h12" />
    </svg>
  );
}

export function IconBulletList() {
  return (
    <svg {...stroke}>
      <path d="M10 7h10M10 12h10M10 17h10" />
      <circle cx="6" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="6" cy="17" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconOrderedList() {
  return (
    <svg {...stroke}>
      <path d="M10 7h10M10 12h10M10 17h10" />
      <path d="M5 6.5h2M5 11.5h2v3H5M5 17h2" />
    </svg>
  );
}

export function IconLink() {
  return (
    <svg {...stroke}>
      <path d="M10 13a5 5 0 0 0 7.07 0l1.76-1.76a5 5 0 0 0-7.07-7.07L10 5.93" />
      <path d="M14 11a5 5 0 0 0-7.07 0L5.17 12.76a5 5 0 0 0 7.07 7.07L14 18.07" />
    </svg>
  );
}

export function IconImage() {
  return (
    <svg {...stroke}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <path d="M4 16l4.5-4.5L14 17l2.5-2.5L20 16" />
    </svg>
  );
}

export function IconCode() {
  return (
    <svg {...stroke}>
      <path d="M9 8 5 12l4 4M15 8l4 4-4 4" />
    </svg>
  );
}

export function IconUndo() {
  return (
    <svg {...stroke}>
      <path d="M9 8H5v4" />
      <path d="M5 12a7 7 0 1 0 2-5.5" />
    </svg>
  );
}

export function IconCallout() {
  return (
    <svg {...stroke}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.8c.6.45 1 1.1 1.1 1.85V17h4.8v-1.35c.1-.75.5-1.4 1.1-1.85A6 6 0 0 0 12 3Z" />
    </svg>
  );
}

/** Word 式字体颜色：A + 底色条 */
export function IconTextColor({ color = "#e11d48" }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M8 16 12 5l4 11M9.5 13h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="5" y="19" width="14" height="3" rx="0.5" fill={color} />
    </svg>
  );
}

/** Word 式荧光笔 */
export function IconHighlight({ color = "#fde047" }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M15.5 4.5 19 8l-8.5 8.5H7v-3.5L15.5 4.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7 19h10" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
