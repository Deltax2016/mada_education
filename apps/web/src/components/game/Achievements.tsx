import {
  BooksIcon,
  CertificateIcon,
  CheckCircleIcon,
  ClockIcon,
  CrosshairIcon,
  FlameIcon,
  FootprintsIcon,
  HourglassIcon,
  LockSimpleIcon,
  MountainsIcon,
  StackIcon,
  TargetIcon,
} from "@phosphor-icons/react/dist/ssr";

import { formatDate, formatNumber, type Locale } from "@/lib/i18n";
import type { Achievement } from "@/lib/types";

const ICONS: Record<string, typeof FlameIcon> = {
  footprints: FootprintsIcon,
  stack: StackIcon,
  mountains: MountainsIcon,
  check: CheckCircleIcon,
  target: TargetIcon,
  crosshair: CrosshairIcon,
  certificate: CertificateIcon,
  books: BooksIcon,
  flame: FlameIcon,
  clock: ClockIcon,
  hourglass: HourglassIcon,
};

export function AchievementCard({
  item,
  locale,
}: {
  item: Achievement;
  locale: Locale;
}) {
  const Icon = ICONS[item.icon] ?? TargetIcon;
  const unlocked = Boolean(item.unlockedAt);
  const percent = Math.min(100, Math.round((item.progress / item.target) * 100));

  return (
    <li
      className={`relative overflow-hidden rounded-[var(--r-lg)] border p-4 transition-colors ${
        unlocked
          ? "border-primary/40 bg-primary-soft"
          : "border-border bg-surface"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-full ${
            unlocked ? "bg-primary text-on-primary" : "bg-surface-2 text-fg-subtle"
          }`}
        >
          {unlocked ? (
            <Icon size={22} weight="fill" aria-hidden />
          ) : (
            <LockSimpleIcon size={18} aria-hidden />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className={`font-semibold leading-snug ${unlocked ? "" : "text-fg-muted"}`}>
            {item.name}
          </p>
          <p className="mt-0.5 text-sm leading-snug text-fg-subtle">{item.hint}</p>

          {unlocked ? (
            <p className="mt-2 text-xs text-primary">
              {formatDate(locale, item.unlockedAt!)}
            </p>
          ) : (
            <div className="mt-2.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-fg-subtle/50"
                  style={{ inlineSize: `${percent}%` }}
                />
              </div>
              <span className="tnum shrink-0 text-xs text-fg-subtle">
                {formatNumber(locale, item.progress)}/{formatNumber(locale, item.target)}
              </span>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function AchievementGrid({
  items,
  locale,
}: {
  items: Achievement[];
  locale: Locale;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <AchievementCard key={item.code} item={item} locale={locale} />
      ))}
    </ul>
  );
}
