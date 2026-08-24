"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";

/**
 * Three states matter: explicit light, explicit dark, and no choice at all
 * (follow the system). Only the first two stamp data-theme on the root.
 */
export function ThemeToggle({ label }: { label: string }) {
  const [mode, setMode] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("mada-theme");
    if (stored === "light" || stored === "dark") setMode(stored);
  }, []);

  function toggle() {
    const current =
      mode ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    setMode(next);
    localStorage.setItem("mada-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={label}
      className="inline-flex size-11 cursor-pointer items-center justify-center rounded-[var(--r-md)] text-fg-muted transition-colors duration-200 hover:bg-surface-2 hover:text-fg"
    >
      <SunIcon size={19} weight="regular" className="icon-dark" aria-hidden />
      <MoonIcon size={19} weight="regular" className="icon-light" aria-hidden />
    </button>
  );
}
