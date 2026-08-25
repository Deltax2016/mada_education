import { FlameIcon } from "@phosphor-icons/react/dist/ssr";

import { formatNumber, type Dict, type Locale } from "@/lib/i18n";
import type { LearnerStats } from "@/lib/types";

/**
 * Level, points and streak in one strip.
 *
 * The bar shows the distance to the next level rather than lifetime points,
 * because lifetime points stop meaning anything once they are large.
 */
export function LevelCard({
  stats,
  locale,
  dict,
}: {
  stats: LearnerStats;
  locale: Locale;
  dict: Dict;
}) {
  const span = stats.levelSpan;
  const percent = span ? Math.min(100, Math.round((stats.intoLevel / span) * 100)) : 100;
  const remaining = span ? span - stats.intoLevel : 0;

  const counters: { label: string; value: number }[] = [
    { label: dict.game.lessons, value: stats.lessonsCompleted },
    { label: dict.game.minutes, value: stats.minutesLearned },
    { label: dict.game.quizzes, value: stats.quizzesPassed },
    { label: dict.game.courses, value: stats.coursesCompleted },
  ];

  return (
    <section className="overflow-hidden rounded-[var(--r-lg)] border border-border bg-surface">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="relative grid size-16 shrink-0 place-items-center">
            <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="20" cy="20" r="17" fill="none" stroke="var(--color-surface-3)" strokeWidth="4" />
              <circle
                cx="20"
                cy="20"
                r="17"
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${(percent / 100) * 106.8} 106.8`}
              />
            </svg>
            <span className="tnum relative text-xl font-bold">
              {formatNumber(locale, stats.level)}
            </span>
          </div>

          <div className="min-w-0">
            <p className="text-xs text-fg-subtle">{dict.game.level}</p>
            <p className="text-lg font-semibold leading-snug">{stats.title}</p>
            <p className="tnum mt-0.5 text-sm text-fg-muted">
              {formatNumber(locale, stats.totalXp)} XP
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-primary transition-[inline-size] duration-500"
              style={{ inlineSize: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-fg-muted">
            {span ? (
              <>
                <span className="tnum">{formatNumber(locale, remaining)}</span> {dict.game.toNext}
              </>
            ) : (
              dict.game.maxLevel
            )}
          </p>
        </div>

        {stats.streakDays > 0 ? (
          <div className="flex shrink-0 items-center gap-2 rounded-[var(--r-md)] bg-warning-soft px-3.5 py-2.5">
            <FlameIcon size={20} weight="fill" className="text-warning" aria-hidden />
            <div>
              <p className="tnum text-lg font-bold leading-none">
                {formatNumber(locale, stats.streakDays)}
              </p>
              <p className="mt-0.5 text-xs text-fg-muted">{dict.game.streak}</p>
            </div>
          </div>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 border-t border-border sm:grid-cols-4">
        {counters.map((counter, index) => (
          <div
            key={counter.label}
            className={`px-5 py-3.5 ${index ? "border-s border-border" : ""} ${
              index === 2 ? "border-t border-border sm:border-t-0" : ""
            } ${index === 3 ? "border-t border-border sm:border-t-0" : ""}`}
          >
            <dt className="text-xs text-fg-subtle">{counter.label}</dt>
            <dd className="tnum mt-0.5 text-xl font-semibold">
              {formatNumber(locale, counter.value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
