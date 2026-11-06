/**
 * TipTap 编辑器：Markdown 存盘；图标工具栏对齐示意图中间栏密度。
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import type { Node as PmNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import {
  isManualLink,
  occurrenceIndexBefore,
  type GlossaryLink,
} from "@/domain";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Strike from "@tiptap/extension-strike";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";
import { Markdown } from "tiptap-markdown";
import {
  rewriteMarkdownForDisplay,
  rewriteMarkdownForStorage,
} from "@/desktop/mediaUrl";
import { t } from "@/i18n";
import { useI18n } from "@/i18n/useI18n";
import { safePartialMarkdown } from "@/ai/inspireProtocol";
import { Callout } from "./Callout";
import { CleanParagraphEnter } from "./CleanParagraphEnter";
import { ColorMenu } from "./ColorMenu";
import { FONT_OPTIONS, FONT_SIZES } from "./colorPalettes";
import { FancyCodeBlock } from "./FancyCodeBlock";
import { FontSize } from "./FontSize";
import { FormulaPalette } from "./FormulaPalette";
import {
  LINE_HEIGHT_PRESETS,
  LineHeight,
  normalizeLineHeight,
} from "./LineHeight";
import { insertIntoActiveMath, setActiveMathField } from "./mathFocus";
import {
  focusLastMathField,
  insertMathAtCursor,
  isMathNodeActive,
} from "./insertMath";
import {
  annotateContentDiff,
  markdownHasDiffAnnotations,
  stripDiffAnnotations,
} from "./contentDiff";
import { DiffAdd, DiffDel } from "./DiffBlocks";
import { MathBlock, MathInline } from "./MathBlock";
import { ensureMathLive, type MathfieldElement } from "./mathliveLoader";
import { ResizableImage } from "./ResizableImage";
import { TrailingNode } from "./TrailingNode";
import { GlossaryDecorations } from "./glossaryDecorations";
import {
  sanitizeMarkdownContent,
  stripPasteHtml,
} from "./sanitizeMarkdown";
import {
  IconBold,
  IconBulletList,
  IconCallout,
  IconCode,
  IconFormula,
  IconImage,
  IconItalic,
  IconLink,
  IconOrderedList,
  IconUnderline,
  IconUndo,
} from "./toolbarIcons";
import styles from "./EditorView.module.css";

/** 魔法棒捕获的目标：整节点或选区 */
export type WandCapture =
  | { kind: "node"; current: string }
  | {
      kind: "selection";
      from: number;
      to: number;
      text: string;
      block: "text" | "code" | "callout";
      language?: string | null;
    };

/** 正文选区 → 词表绑定用（锚文字 + 第几次出现） */
export type GlossaryEditorSelection = {
  text: string;
  occurrenceIndex: number;
};

export interface EditorHandle {
  insertImage: (src: string, alt?: string) => void;
  /** 文件名标题 + 代码块（拖入 txt/json/py 等） */
  insertCodeFile: (name: string, language: string, content: string) => void;
  focus: () => void;
  /** 打开弹窗前记下选区，避免失焦丢选中 */
  captureWandTarget: () => WandCapture;
  /** 将魔法棒结果写回捕获目标 */
  applyWandResult: (target: WandCapture, text: string) => void;
  /** 接受 AI 红绿改动标记 */
  acceptDiffChanges: () => void;
  /** 当前选区（无选中或空串则 null） */
  getGlossarySelection: () => GlossaryEditorSelection | null;
}

interface EditorViewProps {
  nodeId: string;
  markdown: string;
  onChange: (markdown: string) => void;
  /** 灵感流式外推：同节点 markdown 增长时打字机刷新 */
  contentStreaming?: boolean;
  /** Agent 应用前红绿预览：只读，不写回 store */
  contentLocked?: boolean;
  /** 当前节点上的词条链接（渲染层） */
  glossaryLinks?: GlossaryLink[];
  /** 词条自定义引用色（entryId → #rrggbb） */
  glossaryColors?: Record<string, string>;
  /** 词条展示名（悬浮眉题） */
  glossaryTitles?: Record<string, string>;
  /** 词条正文预览（悬浮主内容） */
  glossaryBodies?: Record<string, string>;
  /** @deprecated 改用 onGlossaryPeek / onGlossaryOpen */
  onGlossaryEntryClick?: (entryId: string) => void;
  /** 单击词条高亮：打开浮卡（可多绑多个 id） */
  onGlossaryPeek?: (detail: {
    entryIds: string[];
    primaryId: string;
    clientX: number;
    clientY: number;
  }) => void;
  /** 双击词条高亮：进入词表编辑 */
  onGlossaryOpen?: (entryId: string) => void;
  /** 正文右键：绑定 / 建子词条 / 解绑 */
  onBindGlossary?: (sel: GlossaryEditorSelection) => void;
  onCreateGlossaryChild?: (sel: GlossaryEditorSelection) => void;
  /** 解绑该选区/高亮上全部手动链 */
  onUnbindGlossary?: (sel: GlossaryEditorSelection) => void;
  /** 解绑单条手动链 */
  onUnbindGlossaryLink?: (linkId: string) => void;
  onPickImage?: () => void;
  /** 拖入文件（含图片）时交给工作区分流，返回 true 表示已处理 */
  onDropFiles?: (files: File[]) => boolean | void | Promise<boolean | void>;
}

function pmPosToPlainOffset(doc: PmNode, pos: number): number {
  let plain = 0;
  let done = false;
  doc.descendants((node, nodePos) => {
    if (done) return false;
    if (!node.isText || !node.text) return;
    const end = nodePos + node.text.length;
    if (pos <= nodePos) {
      done = true;
      return false;
    }
    if (pos >= end) {
      plain += node.text.length;
      return;
    }
    plain += pos - nodePos;
    done = true;
    return false;
  });
  return plain;
}

function readGlossarySelection(editor: Editor): GlossaryEditorSelection | null {
  const { from, to, empty } = editor.state.selection;
  if (empty || from === to) return null;
  const plain = editor.state.doc.textContent;
  const pFrom = pmPosToPlainOffset(editor.state.doc, from);
  const pTo = pmPosToPlainOffset(editor.state.doc, to);
  const raw = plain.slice(Math.min(pFrom, pTo), Math.max(pFrom, pTo));
  const text = raw.trim();
  if (!text) return null;
  // trim 后按锚文字重算计次，与 bindGlossaryManual 一致
  const lead = raw.length - raw.trimStart().length;
  const occurrenceIndex = occurrenceIndexBefore(
    plain,
    text,
    Math.min(pFrom, pTo) + lead,
  );
  return { text, occurrenceIndex };
}

function manualLinksForSelection(
  links: GlossaryLink[],
  hostNodeId: string,
  text: string,
  occurrenceIndex?: number,
): GlossaryLink[] {
  const needle = text.trim();
  return links.filter((l) => {
    if (l.hostNodeId !== hostNodeId) return false;
    if (!isManualLink(l) || l.status !== "active") return false;
    if ((l.anchorText || l.matchedText || "").trim() !== needle) return false;
    // 有计次时只列这一处的绑定，避免同名别处的链混进来
    if (
      occurrenceIndex != null &&
      l.occurrenceIndex != null &&
      l.occurrenceIndex !== occurrenceIndex
    ) {
      return false;
    }
    return true;
  });
}

/** 从高亮 DOM 文案推回绑定用选区（第几次出现） */
function selectionFromGlossaryText(
  editor: Editor,
  text: string,
): GlossaryEditorSelection | null {
  if (!text.trim()) return null;
  const plain = editor.state.doc.textContent;
  const { from } = editor.state.selection;
  // 优先用当前光标附近；否则取第 0 次
  const pFrom = pmPosToPlainOffset(editor.state.doc, from);
  let idx = plain.indexOf(text);
  let best = 0;
  let n = 0;
  let nearest = Number.POSITIVE_INFINITY;
  while (idx >= 0) {
    const d = Math.abs(idx - pFrom);
    if (d < nearest) {
      nearest = d;
      best = n;
    }
    n += 1;
    idx = plain.indexOf(text, idx + 1);
  }
  if (n === 0) return { text, occurrenceIndex: 0 };
  return { text, occurrenceIndex: best };
}

type BlockKind = "paragraph" | "heading1" | "heading2";

function currentBlock(editor: NonNullable<ReturnType<typeof useEditor>>): BlockKind {
  if (editor.isActive("heading", { level: 1 })) return "heading1";
  if (editor.isActive("heading", { level: 2 })) return "heading2";
  return "paragraph";
}

function normalizeSizeAttr(raw: string | undefined): string {
  if (!raw) return "";
  const m = /^(\d+)(?:\.\d+)?px$/i.exec(raw.trim());
  if (m) return m[1];
  if (/^\d+$/.test(raw.trim())) return raw.trim();
  return "";
}

type TextRange = { from: number; to: number };

function applyFontSize(
  editor: Editor,
  raw: string,
  selection: TextRange | null,
) {
  const restore = () => {
    let chain = editor.chain().focus();
    if (selection) {
      const docSize = editor.state.doc.content.size;
      const from = Math.max(0, Math.min(selection.from, docSize));
      const to = Math.max(0, Math.min(selection.to, docSize));
      chain = chain.setTextSelection({ from, to });
    }
    return chain;
  };

  const n = raw.trim();
  if (!n) {
    restore().unsetFontSize().run();
    return;
  }
  if (!/^\d+$/.test(n)) return;
  const num = Number(n);
  if (!Number.isFinite(num) || num < 8 || num > 200) return;
  restore().setFontSize(String(num)).run();
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** 行距输入：允许数字与一个小数点 */
function lineHeightDraftDigits(value: string): string {
  let out = "";
  let dot = false;
  for (const ch of value) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch === "." && !dot) {
      out += ".";
      dot = true;
    }
  }
  return out;
}

function applyLineHeight(
  editor: Editor,
  raw: string,
  selection: TextRange | null,
) {
  const restore = () => {
    let chain = editor.chain().focus();
    if (selection) {
      const docSize = editor.state.doc.content.size;
      const from = Math.max(0, Math.min(selection.from, docSize));
      const to = Math.max(0, Math.min(selection.to, docSize));
      chain = chain.setTextSelection({ from, to });
    }
    return chain;
  };

  const n = raw.trim();
  if (!n) {
    restore().unsetLineHeight().run();
    return;
  }
  const v = normalizeLineHeight(n);
  if (!v) return;
  restore().setLineHeight(v).run();
}

type MetricFilter = (raw: string) => string;

/**
 * 字号 / 行距共用壳：保正文选区 + 假光标；按键监听常挂，避免点进框后等 effect 才有响应。
 */
function MetricCombobox({
  editor,
  label,
  defaultLabel,
  fromEditor,
  presets,
  filterDraft,
  applyValue,
}: {
  editor: Editor;
  label: string;
  defaultLabel: string;
  fromEditor: string;
  presets: readonly string[];
  filterDraft: MetricFilter;
  applyValue: (raw: string, selection: TextRange | null) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState(fromEditor);
  const wrapRef = useRef<HTMLDivElement>(null);
  const savedSelection = useRef<TextRange | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const typingRef = useRef(typing);
  typingRef.current = typing;
  const fromEditorRef = useRef(fromEditor);
  fromEditorRef.current = fromEditor;
  const applyRef = useRef(applyValue);
  applyRef.current = applyValue;
  const filterRef = useRef(filterDraft);
  filterRef.current = filterDraft;

  const captureSelection = () => {
    const { from, to } = editor.state.selection;
    savedSelection.current = { from, to };
  };

  useEffect(() => {
    if (typing) return;
    setDraft(fromEditor);
  }, [fromEditor, typing]);

  // 外侧点击：关菜单 / 提交
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
      if (!typingRef.current) return;
      applyRef.current(draftRef.current, savedSelection.current);
      setTyping(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // 按键常挂：用 typingRef 判断，点进框立刻可输入（无 useEffect 一帧延迟）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!typingRef.current) return;
      if (e.key === "Enter") {
        e.preventDefault();
        applyRef.current(draftRef.current, savedSelection.current);
        setTyping(false);
        setMenuOpen(false);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDraft(fromEditorRef.current);
        setTyping(false);
        setMenuOpen(false);
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        setDraft((d) => d.slice(0, -1));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMenuOpen(true);
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setDraft((d) => filterRef.current(d + e.key));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const pickPreset = (v: string) => {
    setMenuOpen(false);
    setTyping(false);
    setDraft(v);
    applyRef.current(v, savedSelection.current);
  };

  const beginType = () => {
    captureSelection();
    setMenuOpen(false);
    setTyping(true);
    // 清空草稿：下一键即替换（像选中全框），光标也更明显
    setDraft("");
  };

  return (
    <div
      className={styles.sizeCombobox}
      ref={wrapRef}
      data-typing={typing || undefined}
      onMouseDown={(e) => {
        e.preventDefault();
        captureSelection();
      }}
    >
      <button
        type="button"
        className={styles.sizeComboboxInput}
        aria-label={label}
        title={label}
        onMouseDown={(e) => {
          e.preventDefault();
          beginType();
        }}
      >
        {typing ? (
          <>
            <span className={styles.sizeDraft}>{draft}</span>
            <span className={styles.sizeCaretFake} aria-hidden />
          </>
        ) : draft ? (
          <span className={styles.sizeDraft}>{draft}</span>
        ) : (
          <span className={styles.sizePlaceholder}>{defaultLabel}</span>
        )}
      </button>
      <button
        type="button"
        className={styles.sizeComboboxCaret}
        aria-label={label}
        aria-expanded={menuOpen}
        tabIndex={-1}
        onMouseDown={(e) => {
          e.preventDefault();
          captureSelection();
          setTyping(false);
          setMenuOpen((o) => !o);
        }}
      >
        ▾
      </button>
      {menuOpen ? (
        <div className={styles.sizeMenu} role="listbox">
          <button
            type="button"
            role="option"
            className={styles.sizeMenuItem}
            onMouseDown={(e) => {
              e.preventDefault();
              pickPreset("");
            }}
          >
            {defaultLabel}
          </button>
          {presets.map((s) => (
            <button
              key={s}
              type="button"
              role="option"
              className={styles.sizeMenuItem}
              data-active={fromEditor === s || undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                pickPreset(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FontSizeInput({
  editor,
  label,
  defaultLabel,
}: {
  editor: Editor;
  label: string;
  defaultLabel: string;
}) {
  const fromEditor = normalizeSizeAttr(
    editor.getAttributes("textStyle").fontSize as string | undefined,
  );
  return (
    <MetricCombobox
      editor={editor}
      label={label}
      defaultLabel={defaultLabel}
      fromEditor={fromEditor}
      presets={FONT_SIZES}
      filterDraft={digitsOnly}
      applyValue={(raw, sel) => applyFontSize(editor, raw, sel)}
    />
  );
}

function LineHeightInput({
  editor,
  label,
  defaultLabel,
}: {
  editor: Editor;
  label: string;
  defaultLabel: string;
}) {
  const fromEditor =
    normalizeLineHeight(
      editor.getAttributes("paragraph").lineHeight as string | undefined,
    ) ?? "";
  return (
    <MetricCombobox
      editor={editor}
      label={label}
      defaultLabel={defaultLabel}
      fromEditor={fromEditor}
      presets={LINE_HEIGHT_PRESETS}
      filterDraft={lineHeightDraftDigits}
      applyValue={(raw, sel) => applyLineHeight(editor, raw, sel)}
    />
  );
}

export const EditorView = forwardRef<EditorHandle, EditorViewProps>(
  function EditorView(
    {
      nodeId,
      markdown,
      onChange,
      contentStreaming,
      contentLocked = false,
      glossaryLinks = [],
      glossaryColors,
      glossaryTitles,
      glossaryBodies,
      onGlossaryEntryClick,
      onGlossaryPeek,
      onGlossaryOpen,
      onBindGlossary,
      onCreateGlossaryChild,
      onUnbindGlossary,
      onUnbindGlossaryLink,
      onPickImage,
      onDropFiles,
    },
    ref,
  ) {
    const { t: tr, locale } = useI18n();
    const [formulaPaletteOpen, setFormulaPaletteOpen] = useState(false);
    const [colorMenu, setColorMenu] = useState<"text" | "highlight" | null>(
      null,
    );
    const [ctxMenu, setCtxMenu] = useState<{
      x: number;
      y: number;
      sel: GlossaryEditorSelection;
      /** 右键点在已绑定高亮上 */
      onBoundLink: boolean;
      entryId?: string | null;
    } | null>(null);
    const [hoverTip, setHoverTip] = useState<{
      x: number;
      y: number;
      text: string;
    } | null>(null);
    /** 点工具栏前记下正文选区，避免下拉/输入抢焦点后丢选中 */
    const toolbarSelection = useRef<TextRange | null>(null);
    const applyingRef = useRef(false);
    /** 节点切换加载世代，避免慢异步 setContent 冲掉用户刚插入的内容 */
    const loadGenRef = useRef(0);
    /**
     * 最近一次写入 store / 从 store 灌入编辑器的 markdown。
     * 用于区分「用户输入回环」与「外部写入」（Agent 应用、撤销等）。
     */
    const emittedMarkdownRef = useRef(markdown);
    const onDropFilesRef = useRef(onDropFiles);
    onDropFilesRef.current = onDropFiles;
    const markdownRef = useRef(markdown);
    markdownRef.current = markdown;
    const streamingRef = useRef(Boolean(contentStreaming));
    streamingRef.current = Boolean(contentStreaming);
    const lockedRef = useRef(Boolean(contentLocked));
    lockedRef.current = Boolean(contentLocked);
    const readOnly = Boolean(contentStreaming) || Boolean(contentLocked);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2] },
          // 改用带语言/复制/行号的深色代码块
          codeBlock: false,
          // 自管 Strike：避免裸 <del> 抢走 DiffDel（含旧稿 data-wg-diff）
          strike: false,
        }),
        Strike.extend({
          parseHTML() {
            return [
              { tag: "s" },
              { tag: "strike" },
              {
                tag: "del",
                getAttrs: (node) => {
                  if (typeof node === "string") return false;
                  const el = node as HTMLElement;
                  if (el.getAttribute("data-wg-diff")) return false;
                  if (el.getAttribute("data-type") === "diff-del") return false;
                  return {};
                },
              },
              {
                style: "text-decoration",
                consuming: false,
                getAttrs: (style) =>
                  typeof style === "string" && style.includes("line-through")
                    ? {}
                    : false,
              },
            ];
          },
        }),
        // 段落行距：挂 paragraph attrs（须在 StarterKit paragraph 之后）
        LineHeight,
        FancyCodeBlock,
        Underline,
        TextStyle,
        Color,
        FontFamily,
        FontSize,
        Highlight.configure({ multicolor: true }),
        Callout,
        MathBlock,
        MathInline,
        DiffAdd,
        DiffDel,
        TrailingNode,
        Placeholder.configure({ placeholder: t("editor.placeholder") }),
        ResizableImage.configure({ allowBase64: true }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { class: "wg-link" },
        }),
        GlossaryDecorations,
        CleanParagraphEnter,
        Markdown.configure({
          html: true,
          transformPastedText: true,
          transformCopiedText: true,
        }),
      ],
      content: "",
      editorProps: {
        // 外站粘贴：剥 span/style，避免写进正文再导出成脏 HTML
        transformPastedHTML: (html) => stripPasteHtml(html),
        handleDrop: (_view, event) => {
          const files = event.dataTransfer?.files;
          if (!files?.length || !onDropFilesRef.current) return false;
          event.preventDefault();
          event.stopPropagation();
          void onDropFilesRef.current([...files]);
          return true;
        },
        handlePaste: (_view, event) => {
          const files = event.clipboardData?.files;
          if (!files?.length || !onDropFilesRef.current) return false;
          const list = [...files].filter((f) => f.type.startsWith("image/"));
          if (!list.length) return false;
          event.preventDefault();
          void onDropFilesRef.current(list);
          return true;
        },
      },
      onUpdate: ({ editor: ed }) => {
        if (applyingRef.current || streamingRef.current || lockedRef.current) {
          return;
        }
        const storage = ed.storage as {
          markdown?: { getMarkdown: () => string };
        };
        const md = storage.markdown?.getMarkdown() ?? ed.getText();
        const stored = rewriteMarkdownForStorage(sanitizeMarkdownContent(md));
        emittedMarkdownRef.current = stored;
        onChange(stored);
      },
      editable: !readOnly,
    });

    useImperativeHandle(ref, () => ({
      insertImage: (src, alt = "") => {
        if (!editor) return;
        editor
          .chain()
          .focus()
          .insertContent([
            { type: "image", attrs: { src, alt, width: null } },
            { type: "paragraph" },
          ])
          .run();
      },
      insertCodeFile: (name, language, content) => {
        if (!editor) return;
        const title = name.trim() || "file";
        const nodes: Record<string, unknown>[] = [
          {
            type: "heading",
            attrs: { level: 3 },
            content: [{ type: "text", text: title }],
          },
          {
            type: "codeBlock",
            attrs: { language: language || null },
            ...(content
              ? { content: [{ type: "text", text: content }] }
              : {}),
          },
          { type: "paragraph" },
        ];
        editor.chain().focus().insertContent(nodes).run();
      },
      focus: () => {
        editor?.chain().focus().run();
      },
      getGlossarySelection: () =>
        editor ? readGlossarySelection(editor) : null,
      captureWandTarget: () => {
        if (!editor) return { kind: "node", current: "" };
        const storage = editor.storage as {
          markdown?: { getMarkdown: () => string };
        };
        const fullMd = rewriteMarkdownForStorage(
          storage.markdown?.getMarkdown() ?? editor.getText(),
        );
        const { selection } = editor.state;
        const { from, to, empty } = selection;

        if (selection instanceof NodeSelection) {
          const node = selection.node;
          if (node.type.name === "codeBlock") {
            return {
              kind: "selection",
              from: from + 1,
              to: to - 1,
              text: node.textContent,
              block: "code",
              language: (node.attrs.language as string | null) ?? null,
            };
          }
          if (node.type.name === "callout") {
            return {
              kind: "selection",
              from: from + 1,
              to: to - 1,
              text: node.textContent,
              block: "callout",
              language: null,
            };
          }
        }

        if (!empty && from !== to) {
          const text = editor.state.doc.textBetween(from, to, "\n");
          let block: "text" | "code" | "callout" = "text";
          let language: string | null = null;
          const $from = selection.$from;
          for (let d = $from.depth; d > 0; d -= 1) {
            const n = $from.node(d);
            if (n.type.name === "codeBlock") {
              block = "code";
              language = (n.attrs.language as string | null) ?? null;
              break;
            }
            if (n.type.name === "callout") {
              block = "callout";
              break;
            }
          }
          return { kind: "selection", from, to, text, block, language };
        }

        return { kind: "node", current: fullMd };
      },
      applyWandResult: (target, text) => {
        if (!editor) return;
        const result = text ?? "";
        const emitMd = () => {
          const storage = editor.storage as {
            markdown?: { getMarkdown: () => string };
          };
          const md = storage.markdown?.getMarkdown() ?? editor.getText();
          const stored = rewriteMarkdownForStorage(sanitizeMarkdownContent(md));
          emittedMarkdownRef.current = stored;
          onChange(stored);
        };

        /**
         * 魔法棒写入必须进 History，便于 Ctrl+Z / 工具栏撤销回到生成前。
         * - 整节点：单次 setContent（addToHistory 默认开启）
         * - 选区：单次 insertContentAt/insertText 替换，避免删+插变成两步撤销
         */
        if (target.kind === "node") {
          void (async () => {
            applyingRef.current = true;
            try {
              const annotated = annotateContentDiff(
                markdownRef.current,
                result,
              );
              const display = await rewriteMarkdownForDisplay(annotated);
              if (editor.isDestroyed) return;
              // emitUpdate=false：避免与 applyingRef 打架；随后手动同步 store
              editor.chain().focus().setContent(display || "", false).run();
              emitMd();
            } catch (err) {
              console.error("wand setContent failed", err);
            } finally {
              applyingRef.current = false;
            }
          })();
          return;
        }

        const docSize = editor.state.doc.content.size;
        const from = Math.max(0, Math.min(target.from, docSize));
        const to = Math.max(from, Math.min(target.to, docSize));

        if (target.block === "code") {
          editor
            .chain()
            .focus()
            .command(({ tr, dispatch }) => {
              if (dispatch) tr.insertText(result, from, to);
              return true;
            })
            .run();
          return;
        }

        applyingRef.current = true;
        try {
          if (!result.trim()) {
            editor.chain().focus().deleteRange({ from, to }).run();
          } else {
            // 一次替换 = 一步撤销（Markdown 扩展会 parse）
            editor
              .chain()
              .focus()
              .insertContentAt({ from, to }, result)
              .run();
          }
          emitMd();
        } catch (err) {
          console.error("wand insert selection failed", err);
        } finally {
          applyingRef.current = false;
        }
      },

      acceptDiffChanges: () => {
        if (!editor) return;
        const raw =
          (
            editor.storage as {
              markdown?: { getMarkdown: () => string };
            }
          ).markdown?.getMarkdown() ?? editor.getText();
        if (!markdownHasDiffAnnotations(raw)) return;
        const cleaned = stripDiffAnnotations(sanitizeMarkdownContent(raw));
        const stored = rewriteMarkdownForStorage(cleaned);
        applyingRef.current = true;
        try {
          void rewriteMarkdownForDisplay(stored).then((display) => {
            if (editor.isDestroyed) return;
            editor.commands.setContent(display || "", false);
            emittedMarkdownRef.current = stored;
            onChange(stored);
            applyingRef.current = false;
          });
        } catch {
          applyingRef.current = false;
        }
      },
    }));

    useEffect(() => {
      if (!editor) return;
      const place = editor.extensionManager.extensions.find(
        (e) => e.name === "placeholder",
      );
      if (place?.options) {
        place.options.placeholder = t("editor.placeholder");
        editor.view.dispatch(editor.state.tr);
      }
    }, [editor, locale]);

    useEffect(() => {
      if (!editor) return;
      const gen = ++loadGenRef.current;
      const snapshot = markdownRef.current;
      emittedMarkdownRef.current = snapshot;
      let cancelled = false;

      (async () => {
        applyingRef.current = true;
        try {
          const display = await rewriteMarkdownForDisplay(snapshot);
          if (cancelled || gen !== loadGenRef.current) return;
          editor.commands.setContent(display || "");
        } finally {
          if (gen === loadGenRef.current) applyingRef.current = false;
        }
      })();

      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodeId, editor]);

    /** 同节点外部改稿（Agent 应用等）：store 变了但 nodeId 未变，需灌回编辑器 */
    useEffect(() => {
      if (!editor || contentStreaming) return;
      if (markdown === emittedMarkdownRef.current) return;
      const gen = ++loadGenRef.current;
      const snapshot = markdown;
      emittedMarkdownRef.current = snapshot;
      let cancelled = false;
      (async () => {
        applyingRef.current = true;
        try {
          const display = await rewriteMarkdownForDisplay(snapshot);
          if (cancelled || gen !== loadGenRef.current) return;
          editor.commands.setContent(display || "", false);
        } finally {
          if (gen === loadGenRef.current) applyingRef.current = false;
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [markdown, editor, contentStreaming]);

    useEffect(() => {
      editor?.setEditable(!contentStreaming && !contentLocked);
    }, [editor, contentStreaming, contentLocked]);

    /**
     * 流式同步：store 为缓冲，编辑器按 rAF 抽最新可见正文。
     * 不用 insertContentAt（非法 pos 会抛错导致整页白屏）；
     * 流式期跳过异步 rewrite，直接 setContent，每帧最多一次以降抖。
     */
    const streamAppliedRef = useRef("");
    const streamRafRef = useRef(0);

    useEffect(() => {
      streamAppliedRef.current = "";
      if (streamRafRef.current) {
        cancelAnimationFrame(streamRafRef.current);
        streamRafRef.current = 0;
      }
    }, [nodeId]);

    useEffect(() => {
      if (!editor || !contentStreaming) return;

      const flush = () => {
        streamRafRef.current = 0;
        const { visible } = safePartialMarkdown(markdownRef.current);
        if (visible === streamAppliedRef.current) return;
        applyingRef.current = true;
        try {
          // emitUpdate=false，避免 onUpdate 回写 store
          editor.commands.setContent(visible || "", false);
          streamAppliedRef.current = visible;
          // 跟着最新生成位置滚，避免字在下面冒、视口还停在上面
          const scroller = editor.view.dom.parentElement;
          if (scroller) scroller.scrollTop = scroller.scrollHeight;
        } catch (err) {
          console.error("inspire stream setContent failed", err);
        } finally {
          applyingRef.current = false;
        }
      };

      if (streamRafRef.current) cancelAnimationFrame(streamRafRef.current);
      streamRafRef.current = requestAnimationFrame(flush);

      return () => {
        if (streamRafRef.current) {
          cancelAnimationFrame(streamRafRef.current);
          streamRafRef.current = 0;
        }
      };
    }, [editor, contentStreaming, markdown, nodeId]);

    useEffect(() => {
      if (!editor) return;
      editor.commands.setGlossaryLinks(
        glossaryLinks,
        nodeId,
        glossaryColors,
        glossaryTitles,
        glossaryBodies,
      );
    }, [
      editor,
      glossaryLinks,
      glossaryColors,
      glossaryTitles,
      glossaryBodies,
      nodeId,
    ]);

    useEffect(() => {
      if (!editor) return;
      const dom = editor.view.dom;
      const onClick = (e: Event) => {
        const ce = e as CustomEvent<{
          entryIds?: string[];
          primaryId?: string;
          entryId?: string;
          clientX?: number;
          clientY?: number;
        }>;
        const primaryId = ce.detail?.primaryId || ce.detail?.entryId;
        const entryIds =
          ce.detail?.entryIds?.length
            ? ce.detail.entryIds
            : primaryId
              ? [primaryId]
              : [];
        if (!entryIds.length || !primaryId) return;
        setHoverTip(null);
        if (onGlossaryPeek) {
          onGlossaryPeek({
            entryIds,
            primaryId,
            clientX: ce.detail?.clientX ?? 120,
            clientY: ce.detail?.clientY ?? 120,
          });
          return;
        }
        onGlossaryEntryClick?.(primaryId);
      };
      const onDbl = (e: Event) => {
        const ce = e as CustomEvent<{
          primaryId?: string;
          entryId?: string;
        }>;
        const id = ce.detail?.primaryId || ce.detail?.entryId;
        if (!id) return;
        setHoverTip(null);
        if (onGlossaryOpen) onGlossaryOpen(id);
        else onGlossaryEntryClick?.(id);
      };
      dom.addEventListener("wg-glossary-click", onClick as EventListener);
      dom.addEventListener("wg-glossary-dblclick", onDbl as EventListener);
      return () => {
        dom.removeEventListener("wg-glossary-click", onClick as EventListener);
        dom.removeEventListener(
          "wg-glossary-dblclick",
          onDbl as EventListener,
        );
      };
    }, [editor, onGlossaryEntryClick, onGlossaryPeek, onGlossaryOpen]);

    useEffect(() => {
      if (!editor) return;
      const dom = editor.view.dom;
      const onCtx = (e: Event) => {
        const ce = e as CustomEvent<{
          clientX: number;
          clientY: number;
          entryId: string | null;
          text: string;
        }>;
        const text = (ce.detail?.text || "").trim();
        if (!text) return;
        setHoverTip(null);
        const sel =
          selectionFromGlossaryText(editor, text) ??
          ({ text, occurrenceIndex: 0 } satisfies GlossaryEditorSelection);
        setCtxMenu({
          x: ce.detail.clientX,
          y: ce.detail.clientY,
          sel,
          onBoundLink: true,
          entryId: ce.detail.entryId,
        });
      };
      dom.addEventListener("wg-glossary-contextmenu", onCtx as EventListener);
      return () =>
        dom.removeEventListener(
          "wg-glossary-contextmenu",
          onCtx as EventListener,
        );
    }, [editor]);

    useEffect(() => {
      if (!editor) return;
      const dom = editor.view.dom;
      const onMove = (e: MouseEvent) => {
        const t = e.target;
        if (!(t instanceof HTMLElement)) {
          setHoverTip(null);
          return;
        }
        const el = t.closest(".wg-glossary-link");
        if (!(el instanceof HTMLElement)) {
          setHoverTip(null);
          return;
        }
        const tip = el.getAttribute("data-glossary-tip");
        if (!tip) {
          setHoverTip(null);
          return;
        }
        setHoverTip({ x: e.clientX + 12, y: e.clientY + 16, text: tip });
      };
      const onLeave = () => setHoverTip(null);
      dom.addEventListener("mousemove", onMove);
      dom.addEventListener("mouseleave", onLeave);
      return () => {
        dom.removeEventListener("mousemove", onMove);
        dom.removeEventListener("mouseleave", onLeave);
      };
    }, [editor]);

    const wasStreamingRef = useRef(false);
    useEffect(() => {
      if (!editor) return;
      const was = wasStreamingRef.current;
      wasStreamingRef.current = Boolean(contentStreaming);
      if (!was || contentStreaming) return;
      if (streamRafRef.current) {
        cancelAnimationFrame(streamRafRef.current);
        streamRafRef.current = 0;
      }
      // 流结束：完整 markdown + 附件 URL 改写再灌一次
      const gen = ++loadGenRef.current;
      const snapshot = markdownRef.current;
      emittedMarkdownRef.current = snapshot;
      let cancelled = false;
      (async () => {
        applyingRef.current = true;
        try {
          const display = await rewriteMarkdownForDisplay(snapshot);
          if (cancelled || gen !== loadGenRef.current) return;
          editor.commands.setContent(display || "", false);
          streamAppliedRef.current = snapshot;
        } finally {
          if (gen === loadGenRef.current) applyingRef.current = false;
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [editor, contentStreaming]);

    if (!editor) return null;

    const withToolbarSelection = () => {
      let chain = editor.chain().focus();
      const sel = toolbarSelection.current;
      if (sel) {
        const docSize = editor.state.doc.content.size;
        chain = chain.setTextSelection({
          from: Math.max(0, Math.min(sel.from, docSize)),
          to: Math.max(0, Math.min(sel.to, docSize)),
        });
      }
      return chain;
    };

    const setBlock = (kind: BlockKind) => {
      const chain = withToolbarSelection();
      if (kind === "paragraph") chain.setParagraph().run();
      else if (kind === "heading1") chain.toggleHeading({ level: 1 }).run();
      else chain.toggleHeading({ level: 2 }).run();
    };

    const onLink = () => {
      const prev = editor.getAttributes("link").href as string | undefined;
      const next = window.prompt(tr("editor.linkPrompt"), prev ?? "https://");
      if (next === null) return;
      const href = next.trim();
      if (!href) {
        withToolbarSelection().extendMarkRange("link").unsetLink().run();
        return;
      }
      withToolbarSelection()
        .extendMarkRange("link")
        .setLink({ href })
        .run();
    };

    const block = currentBlock(editor);

    return (
      <div className={styles.wrap}>
        <div
          className={styles.toolbar}
          role="toolbar"
          aria-label={tr("editor.format")}
          onMouseDown={() => {
            const { from, to } = editor.state.selection;
            toolbarSelection.current = { from, to };
          }}
        >
          <select
            className={styles.blockSelect}
            aria-label={tr("editor.blockType")}
            value={block}
            onChange={(e) => setBlock(e.target.value as BlockKind)}
          >
            <option value="paragraph">{tr("editor.paragraph")}</option>
            <option value="heading1">{tr("editor.heading1")}</option>
            <option value="heading2">{tr("editor.heading2")}</option>
          </select>
          <select
            className={styles.fontSelect}
            aria-label={tr("editor.font")}
            title={tr("editor.font")}
            value={
              (editor.getAttributes("textStyle").fontFamily as string) || ""
            }
            onChange={(e) => {
              const v = e.target.value;
              if (!v) {
                withToolbarSelection().unsetFontFamily().run();
                return;
              }
              withToolbarSelection().setFontFamily(v).run();
            }}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.value || "default"} value={f.value}>
                {locale === "en" ? f.labelEn : f.labelZh}
              </option>
            ))}
          </select>
          <FontSizeInput
            editor={editor}
            label={tr("editor.fontSize")}
            defaultLabel={tr("editor.fontSizeDefault")}
          />
          <LineHeightInput
            editor={editor}
            label={tr("editor.lineHeight")}
            defaultLabel={tr("editor.lineHeightDefault")}
          />

          <span className={styles.sep} />

          <button
            type="button"
            className={styles.toolBtn}
            title={tr("editor.bold")}
            aria-label={tr("editor.bold")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => withToolbarSelection().toggleBold().run()}
            data-active={editor.isActive("bold") || undefined}
          >
            <IconBold />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            title={tr("editor.italic")}
            aria-label={tr("editor.italic")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => withToolbarSelection().toggleItalic().run()}
            data-active={editor.isActive("italic") || undefined}
          >
            <IconItalic />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            title={tr("editor.underline")}
            aria-label={tr("editor.underline")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => withToolbarSelection().toggleUnderline().run()}
            data-active={editor.isActive("underline") || undefined}
          >
            <IconUnderline />
          </button>
          <ColorMenu
            editor={editor}
            open={colorMenu}
            onOpenChange={setColorMenu}
          />

          <span className={styles.sep} />

          <button
            type="button"
            className={styles.toolBtn}
            title={tr("editor.bulletList")}
            aria-label={tr("editor.bulletList")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => withToolbarSelection().toggleBulletList().run()}
            data-active={editor.isActive("bulletList") || undefined}
          >
            <IconBulletList />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            title={tr("editor.orderedList")}
            aria-label={tr("editor.orderedList")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => withToolbarSelection().toggleOrderedList().run()}
            data-active={editor.isActive("orderedList") || undefined}
          >
            <IconOrderedList />
          </button>

          <span className={styles.sep} />

          <button
            type="button"
            className={styles.toolBtn}
            title={tr("editor.link")}
            aria-label={tr("editor.link")}
            onClick={onLink}
            data-active={editor.isActive("link") || undefined}
          >
            <IconLink />
          </button>
          {onPickImage && (
            <button
              type="button"
              className={styles.toolBtn}
              title={tr("editor.image")}
              aria-label={tr("editor.image")}
              onClick={onPickImage}
            >
              <IconImage />
            </button>
          )}
          <button
            type="button"
            className={styles.toolBtn}
            title={tr("editor.code")}
            aria-label={tr("editor.code")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            data-active={editor.isActive("codeBlock") || undefined}
          >
            <IconCode />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            title={tr("editor.callout")}
            aria-label={tr("editor.callout")}
            onClick={() => {
              if (editor.isActive("callout")) {
                editor.chain().focus().toggleCallout().run();
                return;
              }
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "callout",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "text",
                          marks: [{ type: "bold" }],
                          text: `${tr("editor.calloutLabel")} `,
                        },
                      ],
                    },
                  ],
                })
                .run();
            }}
            data-active={editor.isActive("callout") || undefined}
          >
            <IconCallout />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            title={tr("editor.math")}
            aria-label={tr("editor.math")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              void ensureMathLive().then(() => {
                if (isMathNodeActive(editor)) {
                  setFormulaPaletteOpen((o) => !o);
                  return;
                }
                insertMathAtCursor(editor);
                setFormulaPaletteOpen(true);
                requestAnimationFrame(() => {
                  focusLastMathField();
                });
              });
            }}
            data-active={
              isMathNodeActive(editor) || formulaPaletteOpen || undefined
            }
          >
            <IconFormula />
          </button>

          <span className={styles.sep} />

          <button
            type="button"
            className={styles.toolBtn}
            title={tr("editor.undo")}
            aria-label={tr("editor.undo")}
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
          >
            <IconUndo />
          </button>
          {!contentLocked && markdownHasDiffAnnotations(markdown) ? (
            <button
              type="button"
              className={styles.toolBtn}
              title={tr("editor.acceptDiff")}
              aria-label={tr("editor.acceptDiff")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const raw =
                  (
                    editor.storage as {
                      markdown?: { getMarkdown: () => string };
                    }
                  ).markdown?.getMarkdown() ?? editor.getText();
                if (!markdownHasDiffAnnotations(raw)) return;
                const cleaned = stripDiffAnnotations(
                  sanitizeMarkdownContent(raw),
                );
                const stored = rewriteMarkdownForStorage(cleaned);
                applyingRef.current = true;
                void rewriteMarkdownForDisplay(stored)
                  .then((display) => {
                    if (editor.isDestroyed) return;
                    editor.commands.setContent(display || "", false);
                    emittedMarkdownRef.current = stored;
                    onChange(stored);
                  })
                  .finally(() => {
                    applyingRef.current = false;
                  });
              }}
            >
              {tr("editor.acceptDiffShort")}
            </button>
          ) : null}
        </div>
        <div
          className={styles.content}
          onContextMenu={(e) => {
            if (
              !onBindGlossary &&
              !onCreateGlossaryChild &&
              !onUnbindGlossary
            ) {
              return;
            }
            // 已绑定高亮由插件派发 wg-glossary-contextmenu，这里只处理普通选区
            const t = e.target;
            if (t instanceof HTMLElement && t.closest(".wg-glossary-link")) {
              return;
            }
            const sel = readGlossarySelection(editor);
            if (!sel) return;
            e.preventDefault();
            setHoverTip(null);
            setCtxMenu({
              x: e.clientX,
              y: e.clientY,
              sel,
              onBoundLink: false,
            });
          }}
        >
          <EditorContent editor={editor} className={styles.contentInner} />
        </div>
        {hoverTip && !ctxMenu
          ? createPortal(
              <div
                className={styles.glossaryTip}
                style={{ left: hoverTip.x, top: hoverTip.y }}
                role="tooltip"
              >
                {hoverTip.text.split("\n\n· · ·\n\n").map((block, i) => {
                  const nl = block.indexOf("\n");
                  const head = nl >= 0 ? block.slice(0, nl) : "";
                  const body = nl >= 0 ? block.slice(nl + 1) : block;
                  return (
                    <div key={i} className={styles.glossaryTipBlock}>
                      {head ? (
                        <div className={styles.glossaryTipTitle}>{head}</div>
                      ) : null}
                      <div className={styles.glossaryTipBody}>{body}</div>
                    </div>
                  );
                })}
              </div>,
              document.body,
            )
          : null}
        {ctxMenu
          ? createPortal(
              <>
                <div
                  className={styles.ctxBackdrop}
                  onClick={() => setCtxMenu(null)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCtxMenu(null);
                  }}
                />
                <div
                  className={styles.ctxMenu}
                  style={{ left: ctxMenu.x, top: ctxMenu.y }}
                  role="menu"
                >
                  {ctxMenu.onBoundLink && ctxMenu.sel.text ? (
                    <div className={styles.ctxHint} title={ctxMenu.sel.text}>
                      {ctxMenu.sel.text.length > 24
                        ? `${ctxMenu.sel.text.slice(0, 24)}…`
                        : ctxMenu.sel.text}
                    </div>
                  ) : null}
                  {onBindGlossary ? (
                    <button
                      type="button"
                      className={styles.ctxItem}
                      role="menuitem"
                      onClick={() => {
                        onBindGlossary(ctxMenu.sel);
                        setCtxMenu(null);
                      }}
                    >
                      {ctxMenu.onBoundLink
                        ? tr("glossary.editorBindMore")
                        : tr("glossary.editorBind")}
                    </button>
                  ) : null}
                  {!ctxMenu.onBoundLink && onCreateGlossaryChild ? (
                    <button
                      type="button"
                      className={styles.ctxItem}
                      role="menuitem"
                      onClick={() => {
                        onCreateGlossaryChild(ctxMenu.sel);
                        setCtxMenu(null);
                      }}
                    >
                      {tr("glossary.editorCreateChild")}
                    </button>
                  ) : null}
                  {(() => {
                    const bound = manualLinksForSelection(
                      glossaryLinks,
                      nodeId,
                      ctxMenu.sel.text,
                      ctxMenu.sel.occurrenceIndex,
                    );
                    if (!bound.length) return null;
                    const canOne = Boolean(onUnbindGlossaryLink);
                    const canAll = Boolean(onUnbindGlossary);
                    if (!canOne && !canAll) return null;
                    return (
                      <>
                        <div className={styles.ctxSep} />
                        <div className={styles.ctxSubHead}>
                          {tr("glossary.editorBoundList")}
                        </div>
                        {bound.map((l) => {
                          const title =
                            glossaryTitles?.[l.entryId]?.trim() ||
                            l.matchedText ||
                            l.entryId;
                          return (
                            <div key={l.id} className={styles.ctxBoundRow}>
                              <span className={styles.ctxBoundName} title={title}>
                                {title}
                              </span>
                              {canOne ? (
                                <button
                                  type="button"
                                  className={styles.ctxBoundUnbind}
                                  onClick={() => {
                                    onUnbindGlossaryLink?.(l.id);
                                    setCtxMenu(null);
                                  }}
                                >
                                  {tr("glossary.editorUnbindOne")}
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                        {canAll && bound.length > 1 ? (
                          <button
                            type="button"
                            className={styles.ctxItem}
                            role="menuitem"
                            onClick={() => {
                              onUnbindGlossary?.(ctxMenu.sel);
                              setCtxMenu(null);
                            }}
                          >
                            {tr("glossary.editorUnbindAll")}
                          </button>
                        ) : null}
                        {canAll && bound.length === 1 && !canOne ? (
                          <button
                            type="button"
                            className={styles.ctxItem}
                            role="menuitem"
                            onClick={() => {
                              onUnbindGlossary?.(ctxMenu.sel);
                              setCtxMenu(null);
                            }}
                          >
                            {tr("glossary.editorUnbind")}
                          </button>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              </>,
              document.body,
            )
          : null}

        <FormulaPalette
          open={formulaPaletteOpen}
          onClose={() => setFormulaPaletteOpen(false)}
          onInsertFallback={(latex) => {
            void ensureMathLive().then(() => {
              insertMathAtCursor(editor);
              setFormulaPaletteOpen(true);
              requestAnimationFrame(() => {
                const last = focusLastMathField() as MathfieldElement | null;
                if (!last) return;
                setActiveMathField(last);
                insertIntoActiveMath(latex);
              });
            });
          }}
        />
      </div>
    );
  },
);
