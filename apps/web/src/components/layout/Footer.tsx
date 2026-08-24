import Link from "next/link";
import { Wordmark } from "./Wordmark";
import type { Dict, Locale } from "@/lib/i18n";

export function Footer({ locale, dict }: { locale: Locale; dict: Dict }) {
  return (
    <footer className="mt-24 border-t border-border bg-surface">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-[38ch]">
          <div className="flex items-center gap-2.5">
            <Wordmark size={24} />
            <span className="font-semibold">{dict.common.brand}</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">
            {dict.home.footerTagline}
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-10 gap-y-3 text-sm">
          <Link href={`/${locale}/courses`} className="text-fg-muted hover:text-fg">
            {dict.nav.courses}
          </Link>
          <Link href={`/${locale}/dashboard`} className="text-fg-muted hover:text-fg">
            {dict.nav.dashboard}
          </Link>
          <Link href={`/${locale}/teach`} className="text-fg-muted hover:text-fg">
            {dict.teach.nav}
          </Link>
          <Link href={`/${locale}/verify`} className="text-fg-muted hover:text-fg">
            {dict.nav.certificates}
          </Link>
        </nav>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-[1240px] px-5 py-5 text-xs text-fg-subtle sm:px-8">
          {dict.common.brand} · {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}
