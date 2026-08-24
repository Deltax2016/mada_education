import Link from "next/link";
import { PlusIcon, UsersThreeIcon } from "@phosphor-icons/react/dist/ssr";

import { Badge } from "@/components/ui/Badge";
import { CourseCover } from "@/components/CourseCover";
import { ButtonLink } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { api } from "@/lib/api";
import { formatMoney, formatNumber, type Dict, type Locale } from "@/lib/i18n";
import type { MoneyDto } from "@/lib/types";

type Overview = {
  coursesTotal: number;
  coursesPublished: number;
  coursesDraft: number;
  studentsTotal: number;
  completionsTotal: number;
  ratingAvg: number;
  ratingCount: number;
};

type AuthoredCourse = {
  id: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  status: string;
  isFree: boolean;
  price: MoneyDto;
  studentsCount: number;
  ratingAvg: number;
  ratingCount: number;
  lessonsCount: number;
};

export async function InstructorDashboard({
  locale,
  dict,
}: {
  locale: Locale;
  dict: Dict;
}) {
  const [overview, courses] = await Promise.all([
    api<Overview>("/teach/overview", { locale }).catch(() => null),
    api<{ data: AuthoredCourse[] }>("/teach/courses", { locale })
      .then((r) => r.data)
      .catch(() => []),
  ]);

  const stats = overview
    ? [
        { label: dict.teach.statCourses, value: overview.coursesTotal },
        { label: dict.teach.statPublished, value: overview.coursesPublished },
        { label: dict.teach.statDraft, value: overview.coursesDraft },
        { label: dict.teach.statStudents, value: overview.studentsTotal },
        { label: dict.teach.statCompletions, value: overview.completionsTotal },
      ]
    : [];

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-12 sm:px-8 lg:py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[2rem] font-bold leading-tight sm:text-[2.3rem]">
          {dict.teach.dashTitle}
        </h1>
        <ButtonLink href={`/${locale}/teach/courses/new`}>
          <PlusIcon size={17} weight="bold" aria-hidden />
          {dict.teach.newCourse}
        </ButtonLink>
      </div>

      {overview ? (
        <dl className="mt-9 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-lg)] border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="bg-surface px-5 py-5">
              <dt className="text-xs text-fg-subtle">{s.label}</dt>
              <dd className="tnum mt-1.5 text-2xl font-bold">
                {formatNumber(locale, s.value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {courses.length === 0 ? (
        <div className="mt-10">
          <Empty
            title={dict.teach.noCourses}
            body={dict.teach.noCoursesBody}
            action={
              <ButtonLink href={`/${locale}/teach/courses/new`}>
                {dict.teach.newCourse}
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <ul className="mt-10 grid gap-4">
          {courses.map((course) => (
            <li
              key={course.id}
              className="flex flex-col gap-5 rounded-[var(--r-lg)] border border-border bg-surface p-4 sm:flex-row sm:items-center sm:p-5"
            >
              <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-[var(--r-md)] bg-surface-2 sm:aspect-[16/10] sm:w-40">
                <CourseCover
                  src={course.coverUrl}
                  slug={course.slug}
                  title={course.title}
                  sizes="160px"
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={course.status === "published" ? "primary" : "warning"}>
                    {course.status === "published" ? dict.teach.published : dict.teach.draft}
                  </Badge>
                  <span className="tnum text-xs text-fg-subtle">
                    {formatNumber(locale, course.lessonsCount)} {dict.teach.lessons}
                  </span>
                  <span className="tnum text-xs text-fg-subtle">
                    {formatNumber(locale, course.studentsCount)} {dict.teach.students}
                  </span>
                  {course.ratingCount ? (
                    <span className="tnum text-xs text-fg-subtle">
                      {formatNumber(locale, course.ratingAvg)} ({formatNumber(locale, course.ratingCount)})
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-2 truncate font-semibold">{course.title}</h2>
                <p className="tnum mt-1 text-sm text-fg-muted">
                  {course.isFree ? dict.common.free : formatMoney(locale, course.price)}
                </p>
              </div>

              <div className="flex shrink-0 gap-2.5">
                <ButtonLink
                  href={`/${locale}/teach/courses/${course.slug}`}
                  variant="secondary"
                  size="sm"
                >
                  {dict.teach.edit}
                </ButtonLink>
                <ButtonLink
                  href={`/${locale}/teach/courses/${course.slug}/students`}
                  variant="ghost"
                  size="sm"
                >
                  <UsersThreeIcon size={16} aria-hidden />
                  {dict.teach.viewStudents}
                </ButtonLink>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
