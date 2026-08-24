import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap " +
  "transition-[background-color,color,border-color,transform] duration-200 " +
  "active:translate-y-px disabled:pointer-events-none disabled:opacity-50 cursor-pointer";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover shadow-[var(--shadow-sm)]",
  secondary: "bg-surface text-fg border border-border-strong hover:bg-surface-2",
  ghost: "text-fg-muted hover:text-fg hover:bg-surface-2",
  danger: "bg-danger-soft text-danger hover:brightness-95",
};

// One radius scale across the whole product: 10 / 14 / 20 / 28.
const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm rounded-[var(--r-sm)]",
  md: "h-11 px-5 text-[0.95rem] rounded-[var(--r-md)]",
  lg: "h-13 px-7 text-base rounded-[var(--r-md)] min-h-[52px]",
};

type Props = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: Props & ComponentProps<"button">) {
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: Props & ComponentProps<typeof Link>) {
  return (
    <Link className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest}>
      {children}
    </Link>
  );
}
