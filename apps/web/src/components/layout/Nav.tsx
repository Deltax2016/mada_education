import Link from "next/link";
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr";
import { ButtonLink } from "@/components/ui/Button";
import { ThemeToggle } from "./ThemeToggle";
import { LocaleSwitch } from "./LocaleSwitch";
import { Wordmark } from "./Wordmark";
import type { Dict, Locale } from "@/lib/i18n";
import type { Me } from "@/lib/types";

/** Single line at desktop, 68px tall. A nav that wraps is a broken nav. */
export function Nav({
  locale,
  dict,
  me,
}: {
  locale: Locale;
  dict: Dict;
  me: Me | null;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur-md">
      <nav
        className="mx-auto flex h-[var(--nav-h)] max-w-[1240px] items-center gap-2 px-5 sm:px-8"
        aria-label={dict.nav.menu}
      >
        <Link
          href={`/${locale}`}
          className="me-2 flex items-center gap-2.5 text-fg"
          aria-label={dict.common.brand}
        >
          <Wordmark />
          <span className="text-[1.05rem] font-semibold tracking-tight">
            {dict.common.brand}
          </span>
        </Link>

        <Link
          href={`/${locale}/courses`}
          className="hidden rounded-[var(--r-sm)] px-3 py-2 text-sm font-medium text-fg-muted transition-colors duration-200 hover:text-fg sm:block"
        >
          {dict.nav.courses}
        </Link>
        {me ? (
          <Link
            href={`/${locale}/dashboard`}
            className="hidden rounded-[var(--r-sm)] px-3 py-2 text-sm font-medium text-fg-muted transition-colors duration-200 hover:text-fg sm:block"
          >
            {dict.nav.dashboard}
          </Link>
        ) : null}
        <Link
          href={`/${locale}/teach`}
          className="hidden rounded-[var(--r-sm)] px-3 py-2 text-sm font-medium text-fg-muted transition-colors duration-200 hover:text-fg md:block"
        >
          {dict.teach.nav}
        </Link>

        <div className="ms-auto flex items-center gap-1">
          <LocaleSwitch locale={locale} label={dict.nav.language} />
          <ThemeToggle label={dict.nav.theme} />
          {me ? (
            <Link
              href={`/${locale}/dashboard`}
              className="ms-1 flex items-center gap-2 rounded-[var(--r-md)] py-1.5 pe-3 ps-1.5 transition-colors duration-200 hover:bg-surface-2"
            >
              <span
                className="grid size-8 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary"
                aria-hidden
              >
                {me.displayName.trim().charAt(0) || "M"}
              </span>
              <span className="hidden max-w-[12ch] truncate text-sm font-medium sm:block">
                {me.displayName}
              </span>
            </Link>
          ) : (
            <ButtonLink href={`/${locale}/login`} size="sm" className="ms-1">
              {dict.nav.login}
              <CaretRightIcon
                size={14}
                weight="bold"
                className="hidden flip-rtl sm:block"
                aria-hidden
              />
            </ButtonLink>
          )}
        </div>
      </nav>
    </header>
  );
}
