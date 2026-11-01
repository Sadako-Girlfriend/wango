/**
 * 会话启动恢复、防抖自动保存、应用关闭拦截。
 */

import { useEffect, useRef } from "react";
import {
  loadSessionPersist,
  saveSessionPersist,
  type SessionPersistPayload,
} from "@/desktop/sessionPersist";
import { saveWangoToPath } from "@/desktop/fileBridge";
import { isTauriRuntime } from "@/desktop/draftStore";
import { bindOsWangoOpen } from "@/desktop/osOpen";
import { ensureWangoExtension } from "@/desktop/pathUtils";
import { ensureProjectName } from "@/domain";
import { t } from "@/i18n";
import { getPlugin } from "@/plugins";
import {
  useSessionStore,
  type ProjectTab,
} from "@/store/sessionStore";

const AUTOSAVE_MS = 800;

function toPersist(): SessionPersistPayload {
  const s = useSessionStore.getState();
  return {
    schema: 1,
    hasLaunchedBefore: s.hasLaunchedBefore,
    activeTabId: s.activeTabId,
    tabs: s.tabs.map((t) => ({
      id: t.id,
      project: t.project,
      selectedId: t.selectedId,
      collapsedIds: t.collapsedIds,
      searchQuery: t.searchQuery,
      filePath: t.filePath,
      revision: t.revision,
      syncedRevision: t.syncedRevision,
      touched: t.touched,
    })),
    recents: s.recents,
  };
}

export async function flushSessionSave(): Promise<void> {
  const s = useSessionStore.getState();
  try {
    await saveSessionPersist(toPersist());
    for (const tab of s.tabs) {
      if (tab.filePath && tab.revision > tab.syncedRevision) {
        const target = ensureWangoExtension(tab.filePath);
        await saveWangoToPath(tab.project, target);
        const store = useSessionStore.getState();
        if (target !== tab.filePath) {
          store.setFilePath(tab.id, target);
        }
        store.markSynced(tab.id, tab.revision);
      }
    }
    useSessionStore.getState().setSaveError(null);
  } catch (err) {
    console.error(err);
    useSessionStore
      .getState()
      .setSaveError(
        err instanceof Error ? err.message : t("alert.autosaveFailed"),
      );
  }
}

/** 启动时 hydrate；订阅变更防抖落盘 */
export function useSessionLifecycle() {
  const timer = useRef<number | null>(null);
  const hydrated = useSessionStore((s) => s.hydrated);

  useEffect(() => {
    let cancelled = false;
    let osOpenUnlisten: (() => void) | undefined;
    (async () => {
      const payload = await loadSessionPersist();
      if (cancelled) return;
      const tabs: ProjectTab[] = payload.tabs.map((t) => ({
        id: t.id,
        project: ensureProjectName(t.project),
        selectedId: t.selectedId,
        collapsedIds: t.collapsedIds ?? {},
        searchQuery: t.searchQuery ?? "",
        filePath: t.filePath,
        revision: t.revision ?? 0,
        syncedRevision: t.syncedRevision ?? 0,
        touched: t.touched ?? false,
      }));
      useSessionStore.getState().hydrateFromPersist({
        hasLaunchedBefore: payload.hasLaunchedBefore,
        activeTabId: payload.activeTabId,
        tabs,
        recents: payload.recents ?? [],
      });

      // 系统传入的 .wango 优先；没有才在首次启动塞示例模板
      let openedFromOs = false;
      if (isTauriRuntime()) {
        const bound = await bindOsWangoOpen();
        if (!cancelled) osOpenUnlisten = bound.unlisten ?? undefined;
        openedFromOs = bound.openedFromOs;
      }

      const after = useSessionStore.getState();
      if (
        !openedFromOs &&
        !after.hasLaunchedBefore &&
        after.tabs.length === 0
      ) {
        const sample = getPlugin("template.sample");
        if (sample) {
          after.openProjectTab({ project: sample.getInitialData() });
        }
      }
    })();
    return () => {
      cancelled = true;
      osOpenUnlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const unsub = useSessionStore.subscribe(() => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void flushSessionSave();
      }, AUTOSAVE_MS);
    });
    return () => {
      unsub();
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [hydrated]);

  return hydrated;
}

/**
 * 拦截窗口关闭：交给调用方用 confirm 流程；此处注册 Tauri / beforeunload。
 */
export function useWindowCloseGuard(
  hasDirty: boolean,
  onRequestClose: () => Promise<boolean>,
) {
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    if (isTauriRuntime()) {
      (async () => {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { exit } = await import("@tauri-apps/api/app");
        const stop = await getCurrentWindow().onCloseRequested(async (event) => {
          // 先拦住默认关闭，异步确认后再销毁（需 allow-destroy / allow-exit）
          event.preventDefault();
          try {
            const ok = await onRequestClose();
            if (!ok) return;
            await flushSessionSave();
            try {
              await getCurrentWindow().destroy();
            } catch (err) {
              console.error("window.destroy failed, fallback exit", err);
              await exit(0);
            }
          } catch (err) {
            console.error("close flow failed", err);
          }
        });
        if (cancelled) stop();
        else unlisten = stop;
      })().catch(console.error);
    }

    return () => {
      cancelled = true;
      window.removeEventListener("beforeunload", onBeforeUnload);
      unlisten?.();
    };
  }, [hasDirty, onRequestClose]);
}
