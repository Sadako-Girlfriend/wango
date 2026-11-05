/**
 * 三栏壳：左树可拖宽可收起；右 Agent 可拖宽可收起（首启默认开）。
 * 窄窗并排放不下时 Agent 叠在正文上（不挤掉左树）。
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
  MAIN_PANE_WIDTH_MIN,
  saveAppSettings,
  TREE_PANE_WIDTH_DEFAULT,
  TREE_PANE_WIDTH_MAX,
  TREE_PANE_WIDTH_MIN,
} from "@/desktop/appSettings";
import { useI18n } from "@/i18n/useI18n";
import {
  fitSideWidths,
  PANE_BODY_PAD_X,
  PANE_SPLIT_SLOT,
} from "./paneFit";
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
  /** 顶栏高亮用：面板是否真正可见 */
  onAgentVisibleChange?: (visible: boolean) => void;
  /** 递增以触发一次 Agent 开关（与侧栏按钮同一套逻辑） */
  agentToggleRequest?: number;
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
  onAgentVisibleChange,
  agentToggleRequest = 0,
}: TwoPaneProps) {
  const { t } = useI18n();
  /** 用户偏好宽度（拖拽写入）；窄窗显示宽度可能更小 */
  const [preferTree, setPreferTree] = useState(TREE_PANE_WIDTH_DEFAULT);
  const [preferAgent, setPreferAgent] = useState(AGENT_PANE_WIDTH_DEFAULT);
  const [treeWidth, setTreeWidth] = useState(TREE_PANE_WIDTH_DEFAULT);
  const [agentWidth, setAgentWidth] = useState(AGENT_PANE_WIDTH_DEFAULT);
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [agentOpenLocal, setAgentOpenLocal] = useState(true);
  const [agentOverlay, setAgentOverlay] = useState(false);
  const agentOpen =
    agentOpenProp !== undefined ? agentOpenProp : agentOpenLocal;
  const agentVisible = Boolean(agent && agentOpen);
  const agentDocked = agentVisible && !agentOverlay;
  const [dragging, setDragging] = useState<"tree" | "agent" | null>(null);
  const [ready, setReady] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const preferTreeRef = useRef(preferTree);
  const preferAgentRef = useRef(preferAgent);
  const treeWidthRef = useRef(treeWidth);
  const agentWidthRef = useRef(agentWidth);
  const treeCollapsedRef = useRef(treeCollapsed);
  const agentOpenRef = useRef(agentOpen);
  const agentOverlayRef = useRef(agentOverlay);
  const hasAgentRef = useRef(Boolean(agent));
  const prevTabIdRef = useRef<string | null | undefined>(undefined);
  const lastToggleRequestRef = useRef(0);
  preferTreeRef.current = preferTree;
  preferAgentRef.current = preferAgent;
  treeWidthRef.current = treeWidth;
  agentWidthRef.current = agentWidth;
  treeCollapsedRef.current = treeCollapsed;
  agentOpenRef.current = agentOpen;
  agentOverlayRef.current = agentOverlay;
  hasAgentRef.current = Boolean(agent);

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

  const applyFit = useCallback((bodyWidth: number) => {
    const fitted = fitSideWidths({
      bodyWidth,
      preferTree: preferTreeRef.current,
      preferAgent: preferAgentRef.current,
      treeCollapsed: treeCollapsedRef.current,
      agentWanted: hasAgentRef.current && agentOpenRef.current,
    });
    setTreeWidth(
      treeCollapsedRef.current ? preferTreeRef.current : fitted.tree,
    );
    setAgentWidth(fitted.agent || preferAgentRef.current);
    setAgentOverlay(fitted.overlayAgent);
    agentOverlayRef.current = fitted.overlayAgent;
  }, []);

  const setAgentOpen = useCallback(
    (open: boolean) => {
      if (onAgentOpenChange) onAgentOpenChange(open);
      else setAgentOpenLocal(open);
      persist({ agentOpen: open });
      requestAnimationFrame(() => {
        const w = bodyRef.current?.getBoundingClientRect().width;
        if (w) applyFit(w);
      });
    },
    [onAgentOpenChange, persist, applyFit],
  );

  useEffect(() => {
    let cancelled = false;
    void loadAppSettings().then((s) => {
      if (cancelled) return;
      setPreferTree(s.treePaneWidth);
      setPreferAgent(s.agentPaneWidth);
      setTreeWidth(s.treePaneWidth);
      setTreeCollapsed(s.treePaneCollapsed);
      setAgentWidth(s.agentPaneWidth);
      setAgentOpenLocal(s.agentPaneOpen);
      if (onAgentOpenChange) onAgentOpenChange(s.agentPaneOpen);
      requestAnimationFrame(() => {
        if (cancelled) return;
        const w = bodyRef.current?.getBoundingClientRect().width;
        if (w) applyFit(w);
        setReady(true);
      });
    });
    return () => {
      cancelled = true;
    };
    // 仅首启读设置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w == null || dragging) return;
      applyFit(w);
    });
    ro.observe(body);
    return () => ro.disconnect();
  }, [applyFit, dragging, fullPage]);

  useEffect(() => {
    const prev = prevTabIdRef.current;
    prevTabIdRef.current = activeTabId;
    if (prev === undefined || prev === activeTabId) return;
    if (!activeTabId) return;
    if (!treeCollapsedRef.current) return;
    setTreeCollapsed(false);
    persist({ treeCollapsed: false });
    requestAnimationFrame(() => {
      const w = bodyRef.current?.getBoundingClientRect().width;
      if (w) applyFit(w);
    });
  }, [activeTabId, persist, applyFit]);

  const toggleTree = useCallback(() => {
    const next = !treeCollapsedRef.current;
    setTreeCollapsed(next);
    persist({ treeCollapsed: next });
    requestAnimationFrame(() => {
      const w = bodyRef.current?.getBoundingClientRect().width;
      if (w) applyFit(w);
    });
  }, [persist, applyFit]);

  const toggleAgent = useCallback(() => {
    setAgentOpen(!agentOpenRef.current);
  }, [setAgentOpen]);

  useEffect(() => {
    onAgentVisibleChange?.(agentVisible);
  }, [agentVisible, onAgentVisibleChange]);

  useEffect(() => {
    if (!agentToggleRequest || agentToggleRequest === lastToggleRequestRef.current)
      return;
    lastToggleRequestRef.current = agentToggleRequest;
    toggleAgent();
  }, [agentToggleRequest, toggleAgent]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const body = bodyRef.current;
      if (!body) return;
      const rect = body.getBoundingClientRect();
      if (dragging === "tree") {
        const agentSlot = agentDocked ? agentWidthRef.current : 0;
        const splits = 1 + (agentDocked ? 1 : 0);
        const maxByBody = Math.max(
          TREE_PANE_WIDTH_MIN,
          Math.min(
            TREE_PANE_WIDTH_MAX,
            rect.width -
              PANE_BODY_PAD_X -
              splits * PANE_SPLIT_SLOT -
              agentSlot -
              MAIN_PANE_WIDTH_MIN,
          ),
        );
        const next = Math.min(
          maxByBody,
          Math.max(TREE_PANE_WIDTH_MIN, Math.round(e.clientX - rect.left)),
        );
        setPreferTree(next);
        setTreeWidth(next);
        return;
      }
      const fromRight = rect.right - e.clientX;
      if (agentOverlayRef.current) {
        const maxByBody = Math.max(
          AGENT_PANE_WIDTH_MIN,
          Math.min(AGENT_PANE_WIDTH_MAX, rect.width - PANE_BODY_PAD_X - 24),
        );
        const next = Math.min(
          maxByBody,
          Math.max(AGENT_PANE_WIDTH_MIN, Math.round(fromRight - 10)),
        );
        setPreferAgent(next);
        setAgentWidth(next);
        return;
      }
      const treeSlot = treeCollapsedRef.current ? 0 : treeWidthRef.current;
      const maxByBody = Math.max(
        AGENT_PANE_WIDTH_MIN,
        Math.min(
          AGENT_PANE_WIDTH_MAX,
          rect.width -
            PANE_BODY_PAD_X -
            2 * PANE_SPLIT_SLOT -
            treeSlot -
            MAIN_PANE_WIDTH_MIN,
        ),
      );
      const next = Math.min(
        maxByBody,
        Math.max(AGENT_PANE_WIDTH_MIN, Math.round(fromRight)),
      );
      setPreferAgent(next);
      setAgentWidth(next);
    };
    const onUp = () => {
      if (dragging === "tree") {
        persist({ treeWidth: preferTreeRef.current });
      } else {
        persist({ agentWidth: preferAgentRef.current });
      }
      setDragging(null);
      requestAnimationFrame(() => {
        const w = bodyRef.current?.getBoundingClientRect().width;
        if (w) applyFit(w);
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, persist, applyFit, agentDocked]);

  const treeClip = treeCollapsed ? 0 : treeWidth;
  const agentClip = agentDocked ? agentWidth : 0;
  const overlayWidth = Math.max(agentWidth, AGENT_PANE_WIDTH_MIN);

  const agentResizeSplit = (
    collapsed: boolean,
    overlay: boolean,
  ) => (
    <div
      className={overlay ? styles.overlaySplit : styles.vSplit}
      data-active={dragging === "agent" || undefined}
      data-collapsed={collapsed || undefined}
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
        agentVisible
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
          agentVisible ? t("layout.collapseAgent") : t("layout.expandAgent")
        }
        aria-label={
          agentVisible ? t("layout.collapseAgent") : t("layout.expandAgent")
        }
        aria-expanded={agentVisible}
      >
        {agentVisible ? "›" : "‹"}
      </button>
    </div>
  );

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
          data-agent-open={agentVisible ? true : undefined}
          data-agent-overlay={agentOverlay && agentVisible ? true : undefined}
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
            agentOverlay ? (
              agentVisible ? (
                <div
                  className={styles.agentOverlay}
                  style={{ width: overlayWidth }}
                >
                  {agentResizeSplit(false, true)}
                  <aside className={styles.paneAgent}>{agent}</aside>
                </div>
              ) : (
                agentResizeSplit(true, false)
              )
            ) : (
              <>
                {agentResizeSplit(!agentVisible, false)}
                <div
                  className={styles.rightClip}
                  style={{ width: agentClip }}
                  aria-hidden={!agentVisible || undefined}
                >
                  <aside
                    className={styles.paneAgent}
                    style={{
                      width: Math.max(agentWidth, AGENT_PANE_WIDTH_MIN),
                    }}
                  >
                    {agent}
                  </aside>
                </div>
              </>
            )
          ) : null}
        </div>
      )}
    </div>
  );
}
