/**
 * 可缩放、可删除的图片节点视图；缩放时本地预览，松手再写入文档（避免卡顿）。
 * 始终水平居中。
 */

import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import Image from "@tiptap/extension-image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import styles from "./ResizableImage.module.css";

function ImageView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { t } = useI18n();
  const imgRef = useRef<HTMLImageElement>(null);
  const attrWidth = node.attrs.width as number | null;
  const [localWidth, setLocalWidth] = useState<number | null>(attrWidth);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!draggingRef.current) setLocalWidth(attrWidth);
  }, [attrWidth]);

  const displayWidth = localWidth ?? attrWidth;

  const onResizeDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      draggingRef.current = true;
      const startX = e.clientX;
      const startW =
        displayWidth ?? imgRef.current?.getBoundingClientRect().width ?? 320;
      let latest = startW;
      let raf = 0;

      const onMove = (ev: MouseEvent) => {
        latest = Math.max(80, Math.round(startW + (ev.clientX - startX)));
        if (raf) return;
        raf = window.requestAnimationFrame(() => {
          raf = 0;
          setLocalWidth(latest);
        });
      };

      const onUp = () => {
        draggingRef.current = false;
        if (raf) window.cancelAnimationFrame(raf);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setLocalWidth(latest);
        updateAttributes({ width: latest });
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [displayWidth, updateAttributes],
  );

  return (
    <NodeViewWrapper
      className={styles.wrap}
      data-selected={selected || undefined}
      as="div"
    >
      <div
        className={styles.frame}
        style={{ width: displayWidth ? `${displayWidth}px` : undefined }}
      >
        <button
          type="button"
          className={styles.remove}
          contentEditable={false}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteNode();
          }}
          aria-label={t("editor.deleteImage")}
          title={t("editor.deleteImage")}
        >
          ×
        </button>
        <img
          ref={imgRef}
          src={node.attrs.src}
          alt={node.attrs.alt ?? ""}
          className={styles.img}
          draggable={false}
        />
        <span
          className={styles.handle}
          contentEditable={false}
          onMouseDown={onResizeDown}
          title={t("editor.resizeImage")}
        />
      </div>
    </NodeViewWrapper>
  );
}

export const ResizableImage = Image.extend({
  name: "image",
  group: "block",
  inline: false,
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const w = (el as HTMLElement).getAttribute("width");
          return w ? Number(w) : null;
        },
        renderHTML: (attrs) => {
          if (!attrs.width) return {};
          return { width: String(attrs.width) };
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView, {
      className: "node-image",
    });
  },
});
