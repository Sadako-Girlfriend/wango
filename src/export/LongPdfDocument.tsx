/**
 * 离屏只读 TipTap：用与编辑器同构扩展还原正文观感，供截成长图 PDF。
 */

import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import brandMark from "@/assets/logo-2.jpg";
import { createLongPdfExtensions } from "./longPdfExtensions";
import styles from "./LongPdfDocument.module.css";

interface LongPdfDocumentProps {
  /** 已 rewrite 为可显示 URL 的 Markdown（含层级标题） */
  markdown: string;
  projectTitle: string;
  /** 为 true 时不渲染右下角品牌标 */
  hideWatermark?: boolean;
  onReady: (el: HTMLElement) => void;
}

export function LongPdfDocument({
  markdown,
  projectTitle,
  hideWatermark = false,
  onReady,
}: LongPdfDocumentProps) {
  const [mounted, setMounted] = useState(false);

  const editor = useEditor({
    extensions: createLongPdfExtensions(),
    content: "",
    editable: false,
    editorProps: {
      attributes: {
        class: "tiptap",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    (async () => {
      editor.commands.setContent(markdown || "");
      // 等 NodeView / 图片布局一帧
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (!cancelled) setMounted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [editor, markdown]);

  useEffect(() => {
    if (!mounted || !editor) return;
    const root = document.getElementById("wg-long-pdf-root");
    if (!root) return;

    let cancelled = false;
    (async () => {
      const imgs = [...root.querySelectorAll("img")];
      await Promise.all(
        imgs.map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) {
                resolve();
                return;
              }
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
        ),
      );
      // 字体 / 行号 gutter
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          /* ignore */
        }
      }
      // 等公式 MathLive 挂载（导出扩展含 math 节点）
      await new Promise<void>((r) => setTimeout(r, 200));
      if (!cancelled) onReady(root);
    })();

    return () => {
      cancelled = true;
    };
  }, [mounted, editor, onReady]);

  return (
    <div
      id="wg-long-pdf-root"
      className={styles.root}
      data-wg-export="1"
    >
      <header className={styles.cover}>
        <h1 className={styles.title}>{projectTitle}</h1>
      </header>
      <div className={styles.content}>
        <EditorContent editor={editor} />
      </div>
      {!hideWatermark && (
        <footer className={styles.footer}>
          <img
            className={styles.brandMark}
            src={brandMark}
            alt=""
            draggable={false}
          />
        </footer>
      )}
    </div>
  );
}
