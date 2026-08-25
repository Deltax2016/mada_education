import { notFound, redirect } from "next/navigation";

import { AchievementGrid } from "@/components/game/Achievements";
import { LevelCard } from "@/components/game/LevelCard";
import { api } from "@/lib/api";
import { formatNumber, getDict, isLocale, type Locale } from "@/lib/i18n";
import type { LearnerStats } from "@/lib/types";

export default async function ProgressPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = await getDict(locale);

  let stats: LearnerStats;
  try {
    stats = await api<LearnerStats>("/learn/stats", { locale });
  } catch {
    redirect(`/${locale}/login?next=/${locale}/progress`);
  }

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-12 sm:px-8 lg:py-16">
      <h1 className="text-[2rem] font-bold leading-tight sm:text-[2.3rem]">{dict.game.title}</h1>

      <div className="mt-8">
        <LevelCard stats={stats} locale={locale} dict={dict} />
      </div>

      <section className="mt-12">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold">{dict.game.achievements}</h2>
          <p className="tnum text-sm text-fg-subtle">
            {formatNumber(locale, stats.achievementsUnlocked)} {dict.game.achievementsOf}{" "}
            {formatNumber(locale, stats.achievementsTotal)}
          </p>
        </div>
        <div className="mt-5">
          <AchievementGrid items={stats.achievements} locale={locale} />
        </div>
      </section>
    </div>
  );
}
