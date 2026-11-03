/**
 * 三栏壳：左树可拖宽可收起；右 Agent 可拖宽可收起（首启默认开）。
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AGENT_PANE_WIDTH_DEFAULT,
  AGENT_PANE_WIDTH_MAX,
  AGENT_PANE_WIDTH_MIN,
  clampAgentPaneWidth,
  clampTreePaneWidth,
  getAppSettings,
  loadAppSettings,
  saveAppSettings,
  TREE_PANE_WIDTH_DEFAULT,
  TREE_PANE_WIDTH_MAX,
  TREE_PANE_WIDTH_MIN,
} from "@/desktop/appSettings";
import { useI18n } from "@/i18n/useI18n";
import styles from "./TwoPane.module.css";

interface TwoPaneProps {
  header: ReactNode;
  tabBar?: ReactNode;
  tree?: ReactNode;
  workspace?: ReactNode;
  agent?: ReactNode;
  /** 无打开项目时的整页内容（首页） */
  fullPage?: ReactNode;
  /** 当前项目 tab；切换时自动展开左侧栏 */
  activeTabId?: string | null;
  /** 外部也可切换 Agent 开合（Header） */
  agentOpen?: boolean;
  onAgentOpenChange?: (open: boolean) => void;
}

export function TwoPane({
  header,
  tabBar,
  tree,
  workspace,
  agent,
  fullPage,
  activeTabId = null,
  agentOpen: agentOpenProp,
  onAgentOpenChange,
}: TwoPaneProps) {
  const { t } = useI18n();
  const [treeWidth, setTreeWidth] = useState(TREE_PANE_WIDTH_DEFAULT);
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [agentWidth, setAgentWidth] = useState(AGENT_PANE_WIDTH_DEFAULT);
  const [agentOpenLocal, setAgentOpenLocal] = useState(true);
  const agentOpen =
    agentOpenProp !== undefined ? agentOpenProp : agentOpenLocal;
  const [dragging, setDragging] = useState<"tree" | "agent" | null>(null);
  const [ready, setReady] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const treeWidthRef = useRef(treeWidth);
  const agentWidthRef = useRef(agentWidth);
  const treeCollapsedRef = useRef(treeCollapsed);
  const agentOpenRef = useRef(agentOpen);
  const prevTabIdRef = useRef<string | null | undefined>(undefined);
  treeWidthRef.current = treeWidth;
  agentWidthRef.current = agentWidth;
  treeCollapsedRef.current = treeCollapsed;
  agentOpenRef.current = agentOpen;

  const persist = useCallback(
    (next: {
      treeWidth?: number;
      treeCollapsed?: boolean;
      agentWidth?: number;
      agentOpen?: boolean;
    }) => {
      const cur = getAppSettings();
      void saveAppSettings({
        ...cur,
        treePaneWidth:
          next.treeWidth != null
            ? clampTreePaneWidth(next.treeWidth)
            : cur.treePaneWidth,
        treePaneCollapsed:
          next.treeCollapsed != null
            ? next.treeCollapsed
            : cur.treePaneCollapsed,
        agentPaneWidth:
          next.agentWidth != null
            ? clampAgentPaneWidth(next.agentWidth)
            : cur.agentPaneWidth,
        agentPaneOpen:
          next.agentOpen != null ? next.agentOpen : cur.agentPaneOpen,
      });
    },
    [],
  );

  const setAgentOpen = useCallback(
    (open: boolean) => {
      if (onAgentOpenChange) onAgentOpenChange(open);
      else setAgentOpenLocal(open);
      persist({ agentOpen: open });
    },
    [onAgentOpenChange, persist],
  );

  useEffect(() => {
    let cancelled = false;
    void loadAppSettings().then((s) => {
      if (cancelled) return;
      setTreeWidth(s.treePaneWidth);
      setTreeCollapsed(s.treePaneCollapsed);
      setAgentWidth(s.agentPaneWidth);
      setAgentOpenLocal(s.agentPaneOpen);
      if (onAgentOpenChange) onAgentOpenChange(s.agentPaneOpen);
      requestAnimationFrame(() => {
        if (!cancelled) setReady(true);
      });
    });
    return () => {
      cancelled = true;
    };
    // 仅首启读设置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const prev = prevTabIdRef.current;
    prevTabIdRef.current = activeTabId;
    if (prev === undefined || prev === activeTabId) return;
    if (!activeTabId) return;
    if (!treeCollapsedRef.current) return;
    setTreeCollapsed(false);
    persist({ treeCollapsed: false });
  }, [activeTabId, persist]);

  const toggleTree = useCallback(() => {
    const next = !treeCollapsedRef.current;
    setTreeCollapsed(next);
    persist({ treeCollapsed: next });
  }, [persist]);

  const toggleAgent = useCallback(() => {
    setAgentOpen(!agentOpenRef.current);
  }, [setAgentOpen]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const body = bodyRef.current;
      if (!body) return;
      const rect = body.getBoundingClientRect();
      if (dragging === "tree") {
        const maxByBody = Math.max(
          TREE_PANE_WIDTH_MIN,
          Math.min(TREE_PANE_WIDTH_MAX, rect.width - 360),
        );
        const next = Math.min(
          maxByBody,
          Math.max(TREE_PANE_WIDTH_MIN, Math.round(e.clientX - rect.left)),
        );
        setTreeWidth(next);
        return;
      }
      const fromRight = rect.right - e.clientX;
      const maxByBody = Math.max(
        AGENT_PANE_WIDTH_MIN,
        Math.min(AGENT_PANE_WIDTH_MAX, rect.width - 360),
      );
      const next = Math.min(
        maxByBody,
        Math.max(AGENT_PANE_WIDTH_MIN, Math.round(fromRight)),
      );
      setAgentWidth(next);
    };
    const onUp = () => {
      if (dragging === "tree") persist({ treeWidth: treeWidthRef.current });
      else persist({ agentWidth: agentWidthRef.current });
      setDragging(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, persist]);

  const treeClip = treeCollapsed ? 0 : treeWidth;
  const agentClip = agent && agentOpen ? agentWidth : 0;

  return (
    <div className={styles.shell}>
      {header}
      {tabBar}
      {fullPage ? (
        <div className={styles.full}>{fullPage}</div>
      ) : (
        <div
          className={styles.body}
          ref={bodyRef}
          data-tree-collapsed={treeCollapsed || undefined}
          data-agent-open={agent && agentOpen ? true : undefined}
          data-dragging={dragging || undefined}
          data-ready={ready || undefined}
        >
          <div
            className={styles.leftClip}
            style={{ width: treeClip }}
            aria-hidden={treeCollapsed || undefined}
          >
            <aside className={styles.paneLeft} style={{ width: treeWidth }}>
              {tree}
            </aside>
          </div>
          <div
            className={styles.vSplit}
            data-active={dragging === "tree" || undefined}
            data-collapsed={treeCollapsed || undefined}
            onPointerDown={(e) => {
              if (e.button !== 0 || treeCollapsedRef.current) return;
              e.preventDefault();
              setDragging("tree");
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              toggleTree();
            }}
            role="separator"
            aria-orientation="vertical"
            title={
              treeCollapsed
                ? t("layout.expandTree")
                : t("layout.resizeTreeHint")
            }
          >
            <button
              type="button"
              className={styles.toggleBtn}
              onClick={(e) => {
                e.stopPropagation();
                toggleTree();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title={
                treeCollapsed
                  ? t("layout.expandTree")
                  : t("layout.collapseTree")
              }
              aria-label={
                treeCollapsed
                  ? t("layout.expandTree")
                  : t("layout.collapseTree")
              }
              aria-expanded={!treeCollapsed}
            >
              {treeCollapsed ? "›" : "‹"}
            </button>
          </div>

          <main className={styles.paneMain}>{workspace}</main>

          {agent ? (
            <>
              <div
                className={styles.vSplit}
                data-active={dragging === "agent" || undefined}
                data-collapsed={!agentOpen || undefined}
                onPointerDown={(e) => {
                  if (e.button !== 0 || !agentOpenRef.current) return;
                  e.preventDefault();
                  setDragging("agent");
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                }}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  toggleAgent();
                }}
                role="separator"
                aria-orientation="vertical"
                title={
                  agentOpen
                    ? t("layout.resizeAgentHint")
                    : t("layout.expandAgent")
                }
              >
                <button
                  type="button"
                  className={styles.toggleBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAgent();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title={
                    agentOpen
                      ? t("layout.collapseAgent")
                      : t("layout.expandAgent")
                  }
                  aria-label={
                    agentOpen
                      ? t("layout.collapseAgent")
                      : t("layout.expandAgent")
                  }
                  aria-expanded={agentOpen}
                >
                  {agentOpen ? "›" : "‹"}
                </button>
              </div>
              <div
                className={styles.rightClip}
                style={{ width: agentClip }}
                aria-hidden={!agentOpen || undefined}
              >
                <aside
                  className={styles.paneAgent}
                  style={{ width: agentWidth }}
                >
                  {agent}
                </aside>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
