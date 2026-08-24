import Link from "next/link";
import { ClockIcon, StarIcon, UsersIcon } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/Badge";
import { CourseCover } from "@/components/CourseCover";
import { formatDuration, formatMoney, formatNumber, type Dict, type Locale } from "@/lib/i18n";
import type { CourseCard as CourseCardDto } from "@/lib/types";

const levelKey = {
  beginner: "levelBeginner",
  intermediate: "levelIntermediate",
  advanced: "levelAdvanced",
} as const;

export function CourseCard({
  course,
  locale,
  dict,
  featured = false,
}: {
  course: CourseCardDto;
  locale: Locale;
  dict: Dict;
  featured?: boolean;
}) {
  return (
    <Link
      href={`/${locale}/courses/${course.slug}`}
      className={`group flex flex-col overflow-hidden rounded-[var(--r-lg)] border border-border bg-surface transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[var(--shadow-md)] ${
        featured ? "md:flex-row" : ""
      }`}
    >
      <div
        className={`relative shrink-0 overflow-hidden bg-surface-2 ${
          featured ? "aspect-[16/10] md:aspect-auto md:w-[46%]" : "aspect-[16/10]"
        }`}
      >
        <CourseCover
          src={course.coverUrl}
          slug={course.slug}
          title={course.title}
          sizes={featured ? "(max-width: 768px) 100vw, 46vw" : "(max-width: 768px) 100vw, 33vw"}
          className="transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2 ar:justify-end">
          {course.category ? <Badge>{course.category}</Badge> : null}
          <Badge tone="neutral">{dict.common[levelKey[course.level]]}</Badge>
          {course.availableLocales.length > 1 ? (
            <Badge tone="primary">AR · EN</Badge>
          ) : null}
        </div>

        <h3
          className={`font-semibold leading-snug text-fg ${
            featured ? "text-xl md:text-2xl" : "text-[1.05rem]"
          }`}
        >
          {course.title}
        </h3>

        <p
          className={`text-sm leading-relaxed text-fg-muted ${
            featured ? "line-clamp-3" : "line-clamp-2"
          }`}
        >
          {course.subtitle}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 text-xs text-fg-subtle ar:justify-end">
          <span className="inline-flex items-center gap-1.5">
            <StarIcon size={14} weight="fill" className="text-warning" aria-hidden />
            <span className="tnum text-fg-muted">
              {formatNumber(locale, course.ratingAvg)} ({formatNumber(locale, course.ratingCount)})
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <UsersIcon size={14} aria-hidden />
            <span className="tnum">{formatNumber(locale, course.studentsCount)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ClockIcon size={14} aria-hidden />
            <span className="tnum">{formatDuration(locale, course.durationMinutes, dict)}</span>
          </span>
        </div>

        <div className="flex items-baseline gap-2 border-t border-border pt-3 ar:justify-end">
          {course.isFree ? (
            <span className="text-base font-semibold text-primary">{dict.common.free}</span>
          ) : (
            <span className="tnum text-base font-semibold text-fg">
              {formatMoney(locale, course.price)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
