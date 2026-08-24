import type { ReactNode } from "react";

type Tone = "neutral" | "primary" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-muted border-border",
  primary: "bg-primary-soft text-primary border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border px-2.5 py-1 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
