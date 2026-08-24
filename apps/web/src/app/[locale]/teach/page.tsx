import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ChartLineUpIcon,
  RocketLaunchIcon,
  TranslateIcon,
} from "@phosphor-icons/react/dist/ssr";

import { api } from "@/lib/api";
import { getDict, isLocale, type Locale } from "@/lib/i18n";
import { ApplyForm } from "./ApplyForm";
import { InstructorDashboard } from "./Dashboard";
import type { Me } from "@/lib/types";

type Status = {
  isInstructor: boolean;
  nameAr: string | null;
  nameEn: string | null;
  headline: Record<string, string>;
  bio: Record<string, string>;
};

export default async function TeachPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = await getDict(locale);

  const me = await api<Me>("/auth/me", { locale }).catch(() => null);
  const status = me
    ? await api<Status>("/teach/status", { locale }).catch(() => null)
    : null;

  if (status?.isInstructor) {
    return <InstructorDashboard locale={locale} dict={dict} />;
  }

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-14 sm:px-8 lg:py-20">
      <div className="grid gap-12 lg:grid-cols-[1fr_460px] lg:gap-16">
        <div className="ar:ms-auto max-w-[56ch]">
          <h1 className="text-[2rem] font-bold leading-tight sm:text-[2.5rem]">
            {dict.teach.pitchTitle}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-fg-muted">{dict.teach.pitchSub}</p>

          <ul className="mt-10 divide-y divide-border border-t border-border">
            {[
              { icon: RocketLaunchIcon, t: dict.teach.pitch1Title, b: dict.teach.pitch1Body },
              { icon: TranslateIcon, t: dict.teach.pitch2Title, b: dict.teach.pitch2Body },
              { icon: ChartLineUpIcon, t: dict.teach.pitch3Title, b: dict.teach.pitch3Body },
            ].map(({ icon: Icon, t, b }) => (
              <li key={t} className="flex gap-4 py-6">
                <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-[var(--r-md)] bg-primary-soft text-primary">
                  <Icon size={20} aria-hidden />
                </span>
                <div>
                  <h2 className="font-semibold">{t}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-fg-muted">{b}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:sticky lg:top-[calc(var(--nav-h)+2rem)] lg:self-start">
          {me ? (
            <ApplyForm locale={locale} dict={dict} initial={status} />
          ) : (
            <div className="rounded-[var(--r-lg)] border border-border bg-surface p-7 text-center">
              <p className="font-semibold">{dict.teach.notInstructor}</p>
              <p className="mt-2 text-sm text-fg-muted">{dict.learn.authBody}</p>
              <Link
                href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/teach`)}`}
                className="mt-6 inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-[var(--r-md)] bg-primary px-5 font-medium text-on-primary transition-colors duration-200 hover:bg-primary-hover"
              >
                {dict.learn.authCta}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
