/**
 * 公式：块级 / 行内 atom，LaTeX 存 data-latex；编辑用 MathLive。
 *
 * 关键点：MathLive 内部 DOM 会狂变，必须 ignoreMutation；
 * 按键须 stopEvent，否则 ProseMirror 把整块 atom 当成选区一打字就删掉。
 */

import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useI18n } from "@/i18n/useI18n";
import {
  getActiveMathField,
  hideMathVirtualKeyboard,
  setActiveMathField,
} from "./mathFocus";
import { ensureMathLive, type MathfieldElement } from "./mathliveLoader";
import styles from "./MathBlock.module.css";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mathBlock: {
      insertMathBlock: (attrs?: { latex?: string }) => ReturnType;
    };
    mathInline: {
      insertMathInline: (attrs?: { latex?: string }) => ReturnType;
    };
  }
}

function isInsideMathField(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("math-field, [data-wg-math-host]"));
}

type MathVariant = "block" | "inline";

function MathFieldView({
  node,
  updateAttributes,
  deleteNode,
  selected,
  variant,
}: NodeViewProps & { variant: MathVariant }) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLElement>(null);
  const mfRef = useRef<MathfieldElement | null>(null);
  const latex = String(node.attrs.latex ?? "");
  const [ready, setReady] = useState(false);
  const latexFromMfRef = useRef(latex);
  const inline = variant === "inline";

  useEffect(() => {
    let cancelled = false;
    let mf: MathfieldElement | null = null;
    let onInput: (() => void) | null = null;
    let onFocus: (() => void) | null = null;
    let onBlur: (() => void) | null = null;
    let onPointerDown: ((e: Event) => void) | null = null;
    let onKeyDown: ((e: Event) => void) | null = null;

    void ensureMathLive().then(({ MathfieldElement }) => {
      if (cancelled || !hostRef.current) return;
      hostRef.current.replaceChildren();
      mf = new MathfieldElement();
      mf.value = latex;
      mf.mathVirtualKeyboardPolicy = "manual";
      mf.setAttribute("math-virtual-keyboard-policy", "manual");
      if (inline) {
        mf.style.width = "auto";
        mf.style.display = "inline-block";
      } else {
        mf.style.width = "100%";
      }

      onInput = () => {
        if (!mf) return;
        latexFromMfRef.current = mf.value;
        updateAttributes({ latex: mf.value });
      };
      onFocus = () => {
        if (mf) setActiveMathField(mf);
        hideMathVirtualKeyboard();
      };
      onBlur = () => {
        requestAnimationFrame(() => {
          if (mf && getActiveMathField() === mf) {
            const ae = document.activeElement;
            if (ae !== mf && !mf.contains(ae)) setActiveMathField(null);
          }
        });
      };
      onPointerDown = (e) => {
        e.stopPropagation();
        hideMathVirtualKeyboard();
      };
      onKeyDown = (e) => {
        (e as KeyboardEvent).stopPropagation();
      };

      mf.addEventListener("input", onInput);
      mf.addEventListener("focusin", onFocus);
      mf.addEventListener("focusout", onBlur);
      mf.addEventListener("pointerdown", onPointerDown);
      mf.addEventListener("mousedown", onPointerDown);
      mf.addEventListener("keydown", onKeyDown);
      hostRef.current.appendChild(mf);
      mfRef.current = mf;
      setReady(true);
    });

    return () => {
      cancelled = true;
      if (mf && onInput) mf.removeEventListener("input", onInput);
      if (mf && onFocus) mf.removeEventListener("focusin", onFocus);
      if (mf && onBlur) mf.removeEventListener("focusout", onBlur);
      if (mf && onPointerDown) {
        mf.removeEventListener("pointerdown", onPointerDown);
        mf.removeEventListener("mousedown", onPointerDown);
      }
      if (mf && onKeyDown) {
        mf.removeEventListener("keydown", onKeyDown);
      }
      if (mf && getActiveMathField() === mf) setActiveMathField(null);
      mfRef.current = null;
      hostRef.current?.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mf = mfRef.current;
    if (!mf) return;
    if (latexFromMfRef.current === latex) return;
    latexFromMfRef.current = latex;
    if (mf.value !== latex) mf.value = latex;
  }, [latex]);

  const focusField = () => {
    const mf = mfRef.current;
    if (!mf) return;
    mf.focus();
    hideMathVirtualKeyboard();
    setActiveMathField(mf);
  };

  const showHint = ready && !latex.trim();

  return (
    <NodeViewWrapper
      as={inline ? "span" : "div"}
      className={inline ? styles.wrapInline : styles.wrap}
      data-type={inline ? "math-inline" : "math-block"}
      data-wg-math="1"
      data-wg-math-inline={inline ? "1" : undefined}
      data-latex={latex}
      data-selected={selected || undefined}
      onMouseDown={(e: ReactMouseEvent) => {
        const t = e.target as HTMLElement | null;
        if (t?.closest?.("button")) return;
        e.stopPropagation();
        focusField();
      }}
    >
      {!inline ? (
        <span className={styles.label} contentEditable={false}>
          {t("editor.mathBlock")}
        </span>
      ) : null}
      <span
        className={inline ? styles.hostInline : styles.host}
        ref={hostRef}
        contentEditable={false}
        data-wg-math-host="1"
      />
      <span
        className={inline ? styles.placeholderInline : styles.placeholder}
        contentEditable={false}
        data-hidden={showHint ? undefined : true}
      >
        {t("editor.mathPlaceholder")}
      </span>
      <button
        type="button"
        className={inline ? styles.removeInline : styles.remove}
        contentEditable={false}
        aria-label={t("editor.mathRemove")}
        title={t("editor.mathRemove")}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setActiveMathField(null);
          deleteNode();
        }}
      >
        ×
      </button>
    </NodeViewWrapper>
  );
}

function MathBlockView(props: NodeViewProps) {
  return <MathFieldView {...props} variant="block" />;
}

function MathInlineView(props: NodeViewProps) {
  return <MathFieldView {...props} variant="inline" />;
}

const latexAttrs = {
  latex: {
    default: "",
    parseHTML: (el: HTMLElement) => el.getAttribute("data-latex") ?? "",
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs.latex ? { "data-latex": String(attrs.latex) } : {},
  },
};

function mathStopEvent({ event }: { event: Event }) {
  if (isInsideMathField(event.target)) return true;
  if (
    event instanceof KeyboardEvent &&
    (getActiveMathField() ||
      document.activeElement?.tagName?.toLowerCase() === "math-field")
  ) {
    return true;
  }
  return false;
}

function mathKeyboardShortcuts() {
  const editing = () =>
    Boolean(
      getActiveMathField() ||
        document.activeElement?.tagName?.toLowerCase() === "math-field" ||
        isInsideMathField(document.activeElement),
    );
  return {
    Enter: () => editing(),
    Backspace: () => editing(),
    Delete: () => editing(),
  };
}

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  draggable: false,
  selectable: true,
  defining: true,

  addAttributes() {
    return latexAttrs;
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="math-block"]',
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          return { latex: el.getAttribute("data-latex") ?? "" };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const latex = String(node.attrs.latex ?? "");
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "math-block",
        "data-wg-math": "1",
        "data-latex": latex,
        class: "wg-math-block",
      }),
      latex,
    ];
  },

  addCommands() {
    return {
      insertMathBlock:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { latex: attrs?.latex ?? "" },
          }),
    };
  },

  addKeyboardShortcuts() {
    return mathKeyboardShortcuts();
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView, {
      ignoreMutation: () => true,
      stopEvent: mathStopEvent,
    });
  },
});

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  draggable: false,
  selectable: true,

  addAttributes() {
    return latexAttrs;
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="math-inline"]',
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          return { latex: el.getAttribute("data-latex") ?? "" };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const latex = String(node.attrs.latex ?? "");
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "math-inline",
        "data-wg-math": "1",
        "data-wg-math-inline": "1",
        "data-latex": latex,
        class: "wg-math-inline",
      }),
      latex,
    ];
  },

  addCommands() {
    return {
      insertMathInline:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { latex: attrs?.latex ?? "" },
          }),
    };
  },

  addKeyboardShortcuts() {
    return mathKeyboardShortcuts();
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView, {
      // TipTap：行内 NodeView 需 as span（视图里已设）
      ignoreMutation: () => true,
      stopEvent: mathStopEvent,
    });
  },
});
