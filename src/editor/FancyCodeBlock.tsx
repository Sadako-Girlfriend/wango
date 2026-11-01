/**
 * 深色代码块：语言标 + 复制 + 行号 + 过长可展开。
 * 语法高亮走 lowlight；不做「运行」。
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { common, createLowlight } from "lowlight";
import { useI18n } from "@/i18n/useI18n";
import styles from "./FancyCodeBlock.module.css";

const lowlight = createLowlight(common);

/** 折叠时最多露出的行数（对齐示意图「展开」） */
const COLLAPSE_LINES = 12;

const LANG_OPTIONS = [
  "",
  "javascript",
  "typescript",
  "python",
  "json",
  "html",
  "css",
  "rust",
  "go",
  "java",
  "c",
  "cpp",
  "sql",
  "bash",
  "markdown",
  "xml",
  "yaml",
] as const;

type LangValue = (typeof LANG_OPTIONS)[number] | string;

function countLines(text: string): number {
  if (!text) return 1;
  // 末尾换行不额外多算一行，避免空行号跳动
  const trimmed = text.endsWith("\n") ? text.slice(0, -1) : text;
  if (!trimmed) return 1;
  return trimmed.split("\n").length;
}

function langLabel(lang: string, plain: string): string {
  return lang || plain;
}

type MenuPos = { top: number; left: number; openUp: boolean; width: number };

/**
 * 深色语言菜单：portal + fixed，避免撑开编辑区滚动把短代码块顶上去。
 */
function LangPicker({
  language,
  plainLabel,
  ariaLabel,
  onChange,
}: {
  language: string;
  plainLabel: string;
  ariaLabel: string;
  onChange: (lang: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const list = useMemo(() => {
    const base: LangValue[] = [...LANG_OPTIONS];
    if (language && !(LANG_OPTIONS as readonly string[]).includes(language)) {
      base.push(language);
    }
    return base;
  }, [language]);

  const placeMenu = useCallback(() => {
    const trigger = wrapRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuH = Math.min(240, list.length * 30 + 12);
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUp = spaceBelow < menuH && spaceAbove > spaceBelow;
    const top = openUp ? rect.top - gap - menuH : rect.bottom + gap;
    const width = Math.max(148, rect.width);
    let left = rect.left;
    left = Math.min(left, window.innerWidth - width - 8);
    left = Math.max(8, left);
    setPos({
      top: Math.max(8, top),
      left,
      openUp,
      width,
    });
  }, [list.length]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    placeMenu();
  }, [open, placeMenu]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onReposition = () => placeMenu();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    // 捕获滚动：编辑区滚动时跟着挪，且不撑布局
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, placeMenu]);

  const menu =
    open && pos
      ? createPortal(
          <ul
            ref={menuRef}
            className={styles.langMenu}
            role="listbox"
            aria-label={ariaLabel}
            style={{
              top: pos.top,
              left: pos.left,
              minWidth: pos.width,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {list.map((lang) => {
              const value = lang || "";
              const selected = value === language;
              return (
                <li key={value || "plain"} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={styles.langItem}
                    data-selected={selected || undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onChange(value || null);
                      setOpen(false);
                    }}
                  >
                    {langLabel(value, plainLabel)}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div className={styles.langWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.langTrigger}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-open={open || undefined}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span className={styles.langName}>
          {langLabel(language, plainLabel)}
        </span>
        <svg
          className={styles.langCaret}
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          aria-hidden
        >
          <path
            d="M1 1l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {menu}
    </div>
  );
}

function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const { t } = useI18n();
  const language = (node.attrs.language as string | null) || "";
  const lineCount = useMemo(
    () => countLines(node.textContent),
    [node.textContent],
  );
  const canCollapse = lineCount > COLLAPSE_LINES;
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // 变短后自动收起「展开」态，避免空脚
    if (!canCollapse) setExpanded(false);
  }, [canCollapse]);

  const onCopy = useCallback(async () => {
    const text = node.textContent;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 桌面端偶发无 clipboard 权限时降级
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } catch {
        /* ignore */
      }
    }
  }, [node.textContent]);

  const collapsed = canCollapse && !expanded;

  return (
    <NodeViewWrapper
      className={styles.root}
      data-collapsed={collapsed || undefined}
      data-wg-codeblock="1"
    >
      <div className={styles.header} contentEditable={false}>
        <LangPicker
          language={language}
          plainLabel={t("editor.codeLangPlain")}
          ariaLabel={t("editor.codeLang")}
          onChange={(lang) => updateAttributes({ language: lang })}
        />
        <button
          type="button"
          className={styles.copyBtn}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void onCopy();
          }}
          onMouseDown={(e) => e.preventDefault()}
          title={copied ? t("editor.codeCopied") : t("editor.codeCopy")}
          aria-label={copied ? t("editor.codeCopied") : t("editor.codeCopy")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect
              x="9"
              y="9"
              width="11"
              height="11"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.7"
            />
            <path
              d="M5 15V7a2 2 0 0 1 2-2h8"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
          <span>{copied ? t("editor.codeCopied") : t("editor.codeCopy")}</span>
        </button>
      </div>

      <div className={styles.scroller}>
        <div className={styles.gutter} aria-hidden>
          {Array.from({ length: lineCount }, (_, i) => (
            <span key={i} className={styles.lineNo}>
              {i + 1}
            </span>
          ))}
        </div>
        <pre className={styles.pre} spellCheck={false}>
          <NodeViewContent
            as="code"
            className={
              language ? `language-${language} hljs` : "hljs"
            }
          />
        </pre>
      </div>

      {collapsed ? (
        <div className={styles.fade} contentEditable={false} aria-hidden />
      ) : null}

      {canCollapse ? (
        <button
          type="button"
          className={styles.expandBtn}
          contentEditable={false}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <span>
            {expanded ? t("editor.codeCollapse") : t("editor.codeExpand")}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            className={expanded ? styles.chevronUp : undefined}
          >
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}
    </NodeViewWrapper>
  );
}

export const FancyCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({
  lowlight,
  defaultLanguage: null,
  languageClassPrefix: "language-",
});
