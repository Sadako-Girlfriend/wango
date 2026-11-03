/**
 * 左栏竖向分割壳：上大纲树、下词表库，中间拖条改高度。
 *
 * 只负责布局与本机高度偏好（appSettings.glossaryPaneRatio）。
 * 不持有树/词表业务数据，避免与 TreePane / GlossaryPane 状态缠在一起。
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getAppSettings,
  loadAppSettings,
  saveAppSettings,
} from "@/desktop/appSettings";
import styles from "./LeftRail.module.css";

interface LeftRailProps {
  tree: ReactNode;
  glossary: ReactNode;
}

export function LeftRail({ tree, glossary }: LeftRailProps) {
  const [ratio, setRatio] = useState(0.32);
  const [dragging, setDragging] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const ratioRef = useRef(ratio);
  ratioRef.current = ratio;

  useEffect(() => {
    void loadAppSettings().then((s) => setRatio(s.glossaryPaneRatio));
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const rail = railRef.current;
      if (!rail) return;
      const rect = rail.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const next = 1 - y / rect.height;
      setRatio(Math.min(0.7, Math.max(0.15, next)));
    };
    const onUp = () => {
      setDragging(false);
      const cur = getAppSettings();
      void saveAppSettings({
        ...cur,
        glossaryPaneRatio: ratioRef.current,
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);

  const glossaryPct = `${Math.round(ratio * 1000) / 10}%`;

  return (
    <div className={styles.rail} ref={railRef}>
      <div className={styles.treeSlot}>{tree}</div>
      <div
        className={styles.split}
        data-active={dragging || undefined}
        onPointerDown={onPointerDown}
        role="separator"
        aria-orientation="horizontal"
      />
      <div className={styles.glossarySlot} style={{ flexBasis: glossaryPct }}>
        {glossary}
      </div>
    </div>
  );
}
