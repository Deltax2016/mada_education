import type { ReactNode } from "react";

/**
 * Entrance on scroll, done with a CSS scroll-driven animation instead of an
 * IntersectionObserver.
 *
 * The important property is the failure mode: the element is fully visible by
 * default and the animation is layered on only where the browser supports it.
 * A JS-driven reveal that starts at opacity 0 leaves content invisible whenever
 * the observer does not fire, which happens on restored background tabs and
 * anywhere the script does not run.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <div
      className={`reveal ${className}`}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  );
}
