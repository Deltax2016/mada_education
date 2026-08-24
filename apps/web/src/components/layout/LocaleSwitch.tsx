"use client";

import { usePathname, useRouter } from "next/navigation";
import { TranslateIcon } from "@phosphor-icons/react";
import type { Locale } from "@/lib/i18n";

/**
 * Swaps the locale segment and keeps the rest of the path, so a learner in the
 * middle of a lesson stays on that lesson instead of being sent to the home page.
 */
export function LocaleSwitch({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const next: Locale = locale === "ar" ? "en" : "ar";

  function switchLocale() {
    const segments = pathname.split("/");
    segments[1] = next;
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    router.push(segments.join("/") || `/${next}`);
    router.refresh();
  }

  return (
    <button
      onClick={switchLocale}
      // The label collapses to the icon below sm: on a 375px viewport the full
      // nav does not fit on one line, and a nav that wraps is a broken nav.
      className="inline-flex h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-[var(--r-md)] px-2.5 text-sm font-medium text-fg-muted transition-colors duration-200 hover:bg-surface-2 hover:text-fg sm:px-3"
      lang={next}
      aria-label={label}
    >
      <TranslateIcon size={18} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
