/**
 * Tauri 原生文件拖放：Windows 上 HTML5 drop 默认被关掉，必须用这套事件拿路径。
 */

import { useEffect, useRef } from "react";
import { isTauriRuntime } from "./draftStore";

interface Options {
  enabled?: boolean;
  onHover?: (active: boolean) => void;
  onDropPaths: (paths: string[]) => void;
}

export function useTauriFileDrop({
  enabled = true,
  onHover,
  onDropPaths,
}: Options) {
  const onHoverRef = useRef(onHover);
  const onDropRef = useRef(onDropPaths);
  onHoverRef.current = onHover;
  onDropRef.current = onDropPaths;

  useEffect(() => {
    if (!enabled || !isTauriRuntime()) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      const stop = await getCurrentWebview().onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          onHoverRef.current?.(true);
          return;
        }
        if (payload.type === "leave") {
          onHoverRef.current?.(false);
          return;
        }
        if (payload.type === "drop") {
          onHoverRef.current?.(false);
          const paths = payload.paths ?? [];
          if (paths.length) onDropRef.current(paths);
        }
      });
      if (cancelled) {
        stop();
        return;
      }
      unlisten = stop;
    })().catch((err) => {
      console.error("注册拖放失败", err);
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [enabled]);
}
