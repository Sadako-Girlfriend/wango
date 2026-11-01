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
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
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
import { ColorMenu } from "./ColorMenu";
import { FONT_OPTIONS, FONT_SIZES } from "./colorPalettes";
import { FancyCodeBlock } from "./FancyCodeBlock";
import { FontSize } from "./FontSize";
import { ResizableImage } from "./ResizableImage";
import { TrailingNode } from "./TrailingNode";
import {
  IconBold,
  IconBulletList,
  IconCallout,
  IconCode,
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

export interface EditorHandle {
  insertImage: (src: string, alt?: string) => void;
  /** 文件名标题 + 代码块（拖入 txt/json/py 等） */
  insertCodeFile: (name: string, language: string, content: string) => void;
  focus: () => void;
  /** 打开弹窗前记下选区，避免失焦丢选中 */
  captureWandTarget: () => WandCapture;
  /** 将魔法棒结果写回捕获目标 */
  applyWandResult: (target: WandCapture, text: string) => void;
}

interface EditorViewProps {
  nodeId: string;
  markdown: string;
  onChange: (markdown: string) => void;
  /** 灵感流式外推：同节点 markdown 增长时打字机刷新 */
  contentStreaming?: boolean;
  onPickImage?: () => void;
  /** 拖入文件（含图片）时交给工作区分流，返回 true 表示已处理 */
  onDropFiles?: (files: File[]) => boolean | void | Promise<boolean | void>;
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

/**
 * 字号：框内改数字，▾ 选预设。
 * 整控件 mousedown preventDefault，不抢编辑器焦点，正文选区保持可见。
 */
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState(fromEditor);
  const wrapRef = useRef<HTMLDivElement>(null);
  const savedSelection = useRef<TextRange | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const captureSelection = () => {
    const { from, to } = editor.state.selection;
    savedSelection.current = { from, to };
  };

  useEffect(() => {
    if (typing) return;
    setDraft(fromEditor);
  }, [fromEditor, typing]);

  useEffect(() => {
    if (!menuOpen && !typing) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
      if (typing) {
        applyFontSize(editor, draftRef.current, savedSelection.current);
        setTyping(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen, typing, editor]);

  useEffect(() => {
    if (!typing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyFontSize(editor, draftRef.current, savedSelection.current);
        setTyping(false);
        setMenuOpen(false);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDraft(fromEditor);
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
      if (e.key.length === 1 && /\d/.test(e.key) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setDraft((d) => digitsOnly(d + e.key));
        return;
      }
      // 拦截其它可打印字符，避免打进正文
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [typing, editor, fromEditor]);

  const pickPreset = (v: string) => {
    setMenuOpen(false);
    setTyping(false);
    if (!v) {
      setDraft("");
      applyFontSize(editor, "", savedSelection.current);
      return;
    }
    setDraft(v);
    applyFontSize(editor, v, savedSelection.current);
  };

  const beginType = () => {
    captureSelection();
    setMenuOpen(false);
    setTyping(true);
    setDraft(fromEditor);
  };

  return (
    <div
      className={styles.sizeCombobox}
      ref={wrapRef}
      data-typing={typing || undefined}
      onMouseDown={(e) => {
        // 禁止抢焦点，正文选区高亮不消失
        e.preventDefault();
        captureSelection();
      }}
    >
      <button
        type="button"
        className={styles.sizeComboboxInput}
        aria-label={label}
        title={label}
        data-placeholder={!draft ? defaultLabel : undefined}
        onMouseDown={(e) => {
          e.preventDefault();
          beginType();
        }}
      >
        {draft || <span className={styles.sizePlaceholder}>{defaultLabel}</span>}
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
      {menuOpen && (
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
          {FONT_SIZES.map((s) => (
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
      )}
    </div>
  );
}

export const EditorView = forwardRef<EditorHandle, EditorViewProps>(
  function EditorView(
    { nodeId, markdown, onChange, contentStreaming, onPickImage, onDropFiles },
    ref,
  ) {
    const { t: tr, locale } = useI18n();
    const [colorMenu, setColorMenu] = useState<"text" | "highlight" | null>(
      null,
    );
    /** 点工具栏前记下正文选区，避免下拉/输入抢焦点后丢选中 */
    const toolbarSelection = useRef<TextRange | null>(null);
    const applyingRef = useRef(false);
    /** 节点切换加载世代，避免慢异步 setContent 冲掉用户刚插入的内容 */
    const loadGenRef = useRef(0);
    const onDropFilesRef = useRef(onDropFiles);
    onDropFilesRef.current = onDropFiles;
    const markdownRef = useRef(markdown);
    markdownRef.current = markdown;
    const streamingRef = useRef(Boolean(contentStreaming));
    streamingRef.current = Boolean(contentStreaming);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2] },
          // 改用带语言/复制/行号的深色代码块
          codeBlock: false,
        }),
        FancyCodeBlock,
        Underline,
        TextStyle,
        Color,
        FontFamily,
        FontSize,
        Highlight.configure({ multicolor: true }),
        Callout,
        TrailingNode,
        Placeholder.configure({ placeholder: t("editor.placeholder") }),
        ResizableImage.configure({ allowBase64: true }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { class: "wg-link" },
        }),
        Markdown.configure({
          html: true,
          transformPastedText: true,
          transformCopiedText: true,
        }),
      ],
      content: "",
      editorProps: {
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
        if (applyingRef.current || streamingRef.current) return;
        const storage = ed.storage as {
          markdown?: { getMarkdown: () => string };
        };
        const md = storage.markdown?.getMarkdown() ?? ed.getText();
        onChange(rewriteMarkdownForStorage(md));
      },
      editable: !contentStreaming,
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
          onChange(rewriteMarkdownForStorage(md));
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
              const display = await rewriteMarkdownForDisplay(result);
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

    useEffect(() => {
      editor?.setEditable(!contentStreaming);
    }, [editor, contentStreaming]);

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
        </div>
        <EditorContent editor={editor} className={styles.content} />
      </div>
    );
  },
);
