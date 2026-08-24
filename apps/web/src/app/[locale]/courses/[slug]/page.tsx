import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CertificateIcon,
  CheckIcon,
  InfinityIcon,
  LockSimpleIcon,
  PlayCircleIcon,
  StarIcon,
} from "@phosphor-icons/react/dist/ssr";

import { Badge } from "@/components/ui/Badge";
import { CourseCover } from "@/components/CourseCover";
import { ButtonLink } from "@/components/ui/Button";
import { api } from "@/lib/api";
import {
  formatDuration,
  formatMoney,
  formatNumber,
  getDict,
  isLocale,
  plural,
  type Locale,
} from "@/lib/i18n";
import type { CourseDetail } from "@/lib/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  try {
    const course = await api<CourseDetail>(`/catalog/courses/${slug}`, {
      locale,
      token: null,
    });
    return {
      title: course.title,
      description: course.subtitle,
      alternates: {
        languages: { ar: `/ar/courses/${slug}`, en: `/en/courses/${slug}` },
      },
    };
  } catch {
    return {};
  }
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = await getDict(locale);

  let course: CourseDetail;
  try {
    course = await api<CourseDetail>(`/catalog/courses/${slug}`, { locale });
  } catch {
    notFound();
  }

  const firstLesson = course.curriculum[0]?.lessons[0];
  const previewLesson = course.curriculum
    .flatMap((module) => module.lessons)
    .find((lesson) => lesson.isPreview);

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-10 sm:px-8 lg:py-14">
      {course.meta.isFallback ? (
        <p className="mb-6 rounded-[var(--r-md)] border border-border bg-warning-soft px-4 py-3 text-sm text-warning">
          {dict.course.fallbackNotice}
        </p>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[1.35fr_0.65fr] lg:gap-14">
        <div>
          <div className="flex flex-wrap items-center gap-2 ar:justify-end">
            {course.category ? <Badge>{course.category}</Badge> : null}
            <Badge>{dict.common[`level${course.level[0].toUpperCase()}${course.level.slice(1)}` as "levelBeginner"]}</Badge>
            {course.availableLocales.length > 1 ? <Badge tone="primary">AR · EN</Badge> : null}
          </div>

          <h1 className="mt-4 text-[1.9rem] font-bold leading-[1.3] sm:text-[2.4rem]">
            {course.title}
          </h1>
          <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-fg-muted">
            {course.subtitle}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-fg-muted ar:justify-end">
            <span className="inline-flex items-center gap-1.5">
              <StarIcon size={16} weight="fill" className="text-warning" aria-hidden />
              <span className="tnum">
                {formatNumber(locale, course.ratingAvg)} ({formatNumber(locale, course.ratingCount)})
              </span>
            </span>
            <span className="tnum">
              {plural(locale, course.studentsCount, dict.catalog.studentCount)}
            </span>
            <span className="tnum">
              {plural(locale, course.lessonsCount, dict.catalog.lessonCount)}
            </span>
            <span className="tnum">{formatDuration(locale, course.durationMinutes, dict)}</span>
          </div>

          {course.instructor ? (
            <div className="mt-7 flex items-center gap-3 border-t border-border pt-6">
              {course.instructor.avatarUrl ? (
                <Image
                  src={course.instructor.avatarUrl}
                  alt=""
                  width={44}
                  height={44}
                  className="rounded-full object-cover"
                />
              ) : null}
              <div>
                <p className="text-xs text-fg-subtle">{dict.course.instructor}</p>
                <p className="font-medium">{course.instructor.name}</p>
              </div>
            </div>
          ) : null}

          {course.outcomes.length > 0 ? (
            <section className="mt-10">
              <h2 className="text-xl font-bold">{dict.course.outcomes}</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {course.outcomes.map((outcome) => (
                  <li key={outcome} className="flex gap-3 text-fg-muted">
                    <CheckIcon
                      size={18}
                      weight="bold"
                      className="mt-1 shrink-0 text-primary"
                      aria-hidden
                    />
                    <span className="leading-relaxed">{outcome}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-10">
            <h2 className="text-xl font-bold">{dict.course.about}</h2>
            <p className="mt-4 max-w-[68ch] leading-[1.85] text-fg-muted">
              {course.description}
            </p>
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-bold">{dict.course.curriculum}</h2>
            <div className="mt-5 overflow-hidden rounded-[var(--r-lg)] border border-border">
              {course.curriculum.map((module, moduleIndex) => (
                <div key={module.id} className={moduleIndex ? "border-t border-border" : ""}>
                  <h3 className="bg-surface-2 px-5 py-3.5 text-sm font-semibold">
                    {module.title}
                  </h3>
                  <ul>
                    {module.lessons.map((lesson) => {
                      const openable = !lesson.locked;
                      const inner = (
                        <>
                          <span className="shrink-0 text-fg-subtle">
                            {lesson.locked ? (
                              <LockSimpleIcon size={17} aria-hidden />
                            ) : (
                              <PlayCircleIcon
                                size={17}
                                className="text-primary"
                                aria-hidden
                              />
                            )}
                          </span>
                          <span className="flex-1 text-[0.95rem]">{lesson.title}</span>
                          {lesson.isPreview ? (
                            <Badge tone="primary">{dict.course.preview}</Badge>
                          ) : null}
                          <span className="tnum shrink-0 text-xs text-fg-subtle">
                            {formatDuration(locale, lesson.durationMinutes, dict)}
                          </span>
                        </>
                      );
                      return (
                        <li key={lesson.id} className="border-t border-border first:border-t-0">
                          {openable ? (
                            <Link
                              href={`/${locale}/learn/${course.slug}/${lesson.slug}`}
                              className="flex items-center gap-3.5 px-5 py-3.5 transition-colors duration-200 hover:bg-surface-2"
                            >
                              {inner}
                            </Link>
                          ) : (
                            <div
                              className="flex items-center gap-3.5 px-5 py-3.5 text-fg-muted"
                              title={dict.course.locked}
                            >
                              {inner}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {course.reviews.length > 0 ? (
            <section className="mt-12">
              <h2 className="text-xl font-bold">{dict.course.reviews}</h2>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                {course.reviews.map((review) => (
                  <figure
                    key={review.id}
                    className="rounded-[var(--r-lg)] border border-border bg-surface p-5"
                  >
                    <div className="flex gap-0.5" aria-label={`${review.rating}/5`}>
                      {Array.from({ length: review.rating }).map((_, index) => (
                        <StarIcon
                          key={index}
                          size={14}
                          weight="fill"
                          className="text-warning"
                          aria-hidden
                        />
                      ))}
                    </div>
                    <blockquote className="mt-3 line-clamp-3 leading-relaxed text-fg">
                      {review.content}
                    </blockquote>
                    <figcaption className="mt-3 text-sm text-fg-subtle">
                      {review.author}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* Purchase panel. Sticky on desktop so the price and the action stay
            reachable while the curriculum is being read. */}
        <aside className="lg:sticky lg:top-[calc(var(--nav-h)+1.5rem)] lg:self-start">
          <div className="overflow-hidden rounded-[var(--r-lg)] border border-border bg-surface">
            <div className="relative aspect-[16/10] bg-surface-2">
              <CourseCover
                src={course.coverUrl}
                slug={course.slug}
                title={course.title}
                sizes="(max-width: 1024px) 100vw, 34vw"
              />
            </div>
            <div className="p-5">
              <p className="tnum text-2xl font-bold">
                {course.isFree ? dict.common.free : formatMoney(locale, course.price)}
              </p>
              {!course.isFree ? (
                <p className="mt-1 text-xs text-fg-subtle">{dict.course.taxNote}</p>
              ) : null}

              <div className="mt-5 grid gap-2.5">
                {course.isEnrolled ? (
                  <ButtonLink
                    href={`/${locale}/learn/${course.slug}/${firstLesson?.slug ?? ""}`}
                    size="lg"
                  >
                    {dict.course.continue}
                  </ButtonLink>
                ) : (
                  <ButtonLink
                    href={
                      course.isFree
                        ? `/${locale}/learn/${course.slug}/${firstLesson?.slug ?? ""}`
                        : `/${locale}/checkout/${course.slug}`
                    }
                    size="lg"
                  >
                    {course.isFree ? dict.course.enrollFree : dict.course.enroll}
                  </ButtonLink>
                )}
                {previewLesson && !course.isEnrolled ? (
                  <ButtonLink
                    href={`/${locale}/learn/${course.slug}/${previewLesson.slug}`}
                    variant="secondary"
                    size="lg"
                  >
                    {dict.course.preview}
                  </ButtonLink>
                ) : null}
              </div>

              <ul className="mt-6 space-y-3 border-t border-border pt-5 text-sm text-fg-muted">
                <li className="flex items-center gap-2.5">
                  <InfinityIcon size={17} className="text-primary" aria-hidden />
                  {dict.course.lifetimeAccess}
                </li>
                <li className="flex items-center gap-2.5">
                  <CertificateIcon size={17} className="text-primary" aria-hidden />
                  {dict.course.certificate}
                </li>
                <li className="flex items-center gap-2.5">
                  <PlayCircleIcon size={17} className="text-primary" aria-hidden />
                  <span className="tnum">
                    {plural(locale, course.lessonsCount, dict.catalog.lessonCount)}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
