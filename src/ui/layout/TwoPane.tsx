/**
 * 极简两栏壳：左树 30% / 右编辑 70%。
 * 支持顶栏下方插入选项卡条；无 tab 时可整页渲染首页。
 */

import type { ReactNode } from "react";
import styles from "./TwoPane.module.css";

interface TwoPaneProps {
  header: ReactNode;
  tabBar?: ReactNode;
  tree?: ReactNode;
  workspace?: ReactNode;
  /** 无打开项目时的整页内容（首页） */
  fullPage?: ReactNode;
}

export function TwoPane({
  header,
  tabBar,
  tree,
  workspace,
  fullPage,
}: TwoPaneProps) {
  return (
    <div className={styles.shell}>
      {header}
      {tabBar}
      {fullPage ? (
        <div className={styles.full}>{fullPage}</div>
      ) : (
        <div className={styles.body}>
          <aside className={styles.paneLeft}>{tree}</aside>
          <main className={styles.paneRight}>{workspace}</main>
        </div>
      )}
    </div>
  );
}
