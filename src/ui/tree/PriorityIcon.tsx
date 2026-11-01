/**
 * 优先级小图标：形色双通道（不只靠颜色）。
 * high=实心旗，medium=半旗，low=空心旗。
 */

import type { NodePriority } from "@/domain";

interface PriorityIconProps {
  priority: NodePriority;
  className?: string;
  title?: string;
}

export function PriorityIcon({ priority, className, title }: PriorityIconProps) {
  return (
    <span className={className} data-p={priority} title={title}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        aria-hidden
        focusable="false"
      >
        {priority === "high" ? (
          <>
            <path d="M3.5 2v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path
              d="M4.2 2.4h7.2L9.6 5.2l1.8 2.8H4.2V2.4Z"
              fill="currentColor"
            />
          </>
        ) : null}
        {priority === "medium" ? (
          <>
            <path d="M3.5 2v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path
              d="M4.2 2.4h7.2L9.6 5.2l1.8 2.8H4.2V2.4Z"
              fill="currentColor"
              fillOpacity="0.35"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </>
        ) : null}
        {priority === "low" ? (
          <>
            <path d="M3.5 2v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path
              d="M4.2 2.4h7.2L9.6 5.2l1.8 2.8H4.2V2.4Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </>
        ) : null}
      </svg>
    </span>
  );
}
