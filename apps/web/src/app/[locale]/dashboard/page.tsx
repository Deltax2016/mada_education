import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CertificateIcon, GraduationCapIcon } from "@phosphor-icons/react/dist/ssr";

import { ButtonLink } from "@/components/ui/Button";
import { CourseCover } from "@/components/CourseCover";
import { Empty } from "@/components/ui/Empty";
import { Progress } from "@/components/ui/Progress";
import { api } from "@/lib/api";
import { formatDate, formatRatio, getDict, isLocale, type Locale } from "@/lib/i18n";
import type { Certificate, MyCourse } from "@/lib/types";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = await getDict(locale);

  let courses: MyCourse[];
  try {
    courses = (await api<{ data: MyCourse[] }>("/learn/courses", { locale })).data;
  } catch {
    redirect(`/${locale}/login?next=/${locale}/dashboard`);
  }

  const resume =
    courses.find((c) => c.progressPercent > 0 && c.progressPercent < 100) ??
    courses.find((c) => c.status !== "completed") ??
    null;

  const certificates = await api<{ data: Certificate[] }>("/learn/certificates", { locale })
    .then((r) => r.data)
    .catch(() => []);

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-12 sm:px-8 lg:py-16">
      <header>
        <h1 className="text-[2rem] font-bold leading-tight sm:text-[2.3rem]">
          {dict.dashboard.title}
        </h1>
      </header>

      {resume ? (
        // The single most useful thing on this page is the way back into the one
        // course the learner is actually in the middle of. Everything else is a list.
        <section className="mt-8 overflow-hidden rounded-[var(--r-lg)] border border-primary bg-primary-soft">
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-[var(--r-md)] bg-surface-2 sm:aspect-[16/10] sm:w-44">
              <CourseCover
                src={resume.coverUrl}
                slug={resume.slug}
                title={resume.title}
                sizes="176px"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-primary">{dict.dashboard.resumeTitle}</p>
              <h2 className="mt-1.5 text-lg font-semibold leading-snug">{resume.title}</h2>
              <div className="mt-3 flex items-center gap-3">
                <Progress value={resume.progressPercent} className="max-w-56 flex-1" />
                <span className="tnum shrink-0 text-xs text-fg-muted">
                  {formatRatio(locale, resume.lessonsCompleted, resume.lessonsTotal)}
                </span>
              </div>
            </div>
            <ButtonLink
              href={
                resume.continueSlug
                  ? `/${locale}/learn/${resume.slug}/${resume.continueSlug}`
                  : `/${locale}/courses/${resume.slug}`
              }
              size="lg"
              className="shrink-0"
            >
              {dict.dashboard.resumeCta}
            </ButtonLink>
          </div>
        </section>
      ) : null}

      {courses.length > 0 ? (
        <h2 className="mt-12 text-lg font-semibold">{dict.dashboard.allCourses}</h2>
      ) : null}

      {courses.length === 0 ? (
        <div className="mt-9">
          <Empty
            icon={<GraduationCapIcon size={34} aria-hidden />}
            title={dict.dashboard.empty}
            body={dict.dashboard.emptyBody}
            action={
              <ButtonLink href={`/${locale}/courses`}>{dict.dashboard.browse}</ButtonLink>
            }
          />
        </div>
      ) : (
        <ul className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <li key={course.courseId}>
              <Link
                href={
                  course.continueSlug
                    ? `/${locale}/learn/${course.slug}/${course.continueSlug}`
                    : `/${locale}/courses/${course.slug}`
                }
                className="group flex h-full flex-col overflow-hidden rounded-[var(--r-lg)] border border-border bg-surface transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[var(--shadow-md)]"
              >
                <div className="relative aspect-[16/9] bg-surface-2">
                  <CourseCover
                    src={course.coverUrl}
                    slug={course.slug}
                    title={course.title}
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="font-semibold leading-snug">{course.title}</h2>
                  <div className="mt-auto pt-5">
                    <div className="flex items-center justify-between text-xs text-fg-subtle">
                      <span>
                        {course.status === "completed"
                          ? dict.dashboard.completedLabel
                          : dict.learn.progress}
                      </span>
                      <span className="tnum">
                        {formatRatio(locale, course.lessonsCompleted, course.lessonsTotal)}
                      </span>
                    </div>
                    <Progress value={course.progressPercent} className="mt-2" />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-16">
        <h2 className="text-xl font-bold">{dict.dashboard.certificates}</h2>
        {certificates.length === 0 ? (
          <p className="mt-4 text-sm text-fg-muted">{dict.dashboard.noCertificates}</p>
        ) : (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {certificates.map((certificate) => (
              <li
                key={certificate.serial}
                className="flex gap-4 rounded-[var(--r-lg)] border border-border bg-surface p-5"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-[var(--r-md)] bg-primary-soft text-primary">
                  <CertificateIcon size={22} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{certificate.courseTitle}</p>
                  <p className="mt-1 text-xs text-fg-subtle">
                    {dict.dashboard.issuedOn}{" "}
                    <span className="tnum">{formatDate(locale, certificate.issuedAt)}</span>
                  </p>
                  <p className="mt-2 text-xs text-fg-muted">
                    {dict.dashboard.serial}: <span className="tnum">{certificate.serial}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
