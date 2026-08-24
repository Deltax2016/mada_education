import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  LockSimpleIcon,
  PlayCircleIcon,
  QuestionIcon,
  SignInIcon,
} from "@phosphor-icons/react/dist/ssr";

import { BlockRenderer } from "@/components/blocks/BlockRenderer";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { CompleteButton } from "@/components/CompleteButton";
import { ButtonLink } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { api, ApiError } from "@/lib/api";
import { formatDuration, formatRatio, getDict, isLocale, type Locale } from "@/lib/i18n";
import type { Lesson, Me, Outline } from "@/lib/types";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ locale: string; course: string; lesson: string }>;
}) {
  const { locale: raw, course: courseSlug, lesson: lessonSlug } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = await getDict(locale);

  const outline = await api<Outline>(`/learn/courses/${courseSlug}/outline`, {
    locale,
  }).catch(() => null);
  if (!outline) notFound();

  let lesson: Lesson | null = null;
  let denied: string | null = null;
  try {
    lesson = await api<Lesson>(
      `/learn/courses/${courseSlug}/lessons/${lessonSlug}`,
      { locale },
    );
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      denied = error.code;
    } else {
      notFound();
    }
  }

  const me = await api<Me>("/auth/me", { locale }).catch(() => null);

  const flat = outline.modules.flatMap((module) => module.lessons);
  const index = flat.findIndex((item) => item.slug === lessonSlug);
  const previous = index > 0 ? flat[index - 1] : null;
  const next = index >= 0 && index < flat.length - 1 ? flat[index + 1] : null;

  return (
    <div className="mx-auto grid max-w-[1360px] gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10 lg:py-10">
      <article className="min-w-0">
        <nav className="mb-5 text-sm">
          <Link
            href={`/${locale}/courses/${courseSlug}`}
            className="inline-flex items-center gap-1.5 text-fg-muted transition-colors hover:text-fg"
          >
            <ArrowRightIcon size={15} className="rotate-180 flip-rtl" aria-hidden />
            {outline.title}
          </Link>
        </nav>

        {denied ? (
          <Gate
            locale={locale}
            dict={dict}
            code={denied}
            courseSlug={courseSlug}
            lessonSlug={lessonSlug}
          />
        ) : lesson ? (
          <>
            {lesson.meta.isFallback ? (
              <p className="mb-5 rounded-[var(--r-md)] border border-border bg-warning-soft px-4 py-3 text-sm text-warning">
                {dict.learn.fallbackNotice}
              </p>
            ) : null}

            {lesson.media ? (
              <VideoPlayer
                src={lesson.media.src}
                poster={lesson.media.poster}
                lessonId={lesson.id}
                startAt={lesson.progress?.lastPositionSeconds ?? 0}
                subtitles={lesson.media.subtitles}
                watermark={me?.displayName ?? undefined}
              />
            ) : null}

            <h1 className="mt-7 text-[1.7rem] font-bold leading-[1.35] sm:text-[2rem]">
              {lesson.title}
            </h1>
            <p className="mt-2.5 inline-flex items-center gap-1.5 text-sm text-fg-subtle">
              <ClockIcon size={15} aria-hidden />
              <span className="tnum">{formatDuration(locale, lesson.durationMinutes, dict)}</span>
            </p>

            <div className="mt-7">
              <BlockRenderer blocks={lesson.blocks} />
            </div>

            {lesson.quizId ? (
              <div className="mt-10 flex flex-wrap items-center gap-4 rounded-[var(--r-lg)] border border-border bg-surface p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-[var(--r-md)] bg-primary-soft text-primary">
                  <QuestionIcon size={22} aria-hidden />
                </span>
                <p className="flex-1 font-medium">{lesson.title}</p>
                <ButtonLink
                  href={`/${locale}/learn/${courseSlug}/quiz/${lesson.quizId}`}
                  size="md"
                >
                  {dict.learn.startQuiz}
                </ButtonLink>
              </div>
            ) : null}

            <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
              <CompleteButton
                lessonId={lesson.id}
                done={lesson.progress?.status === "completed"}
                labelIdle={dict.learn.markComplete}
                labelDone={dict.learn.completed}
              />
              <div className="flex gap-2.5">
                {previous ? (
                  <ButtonLink
                    href={`/${locale}/learn/${courseSlug}/${previous.slug}`}
                    variant="secondary"
                    size="sm"
                  >
                    {dict.learn.prevLesson}
                  </ButtonLink>
                ) : null}
                {next ? (
                  <ButtonLink
                    href={`/${locale}/learn/${courseSlug}/${next.slug}`}
                    variant="secondary"
                    size="sm"
                  >
                    {dict.learn.nextLesson}
                    <ArrowRightIcon size={15} weight="bold" className="flip-rtl" aria-hidden />
                  </ButtonLink>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </article>

      <aside className="lg:sticky lg:top-[calc(var(--nav-h)+1.5rem)] lg:h-[calc(100dvh-var(--nav-h)-3rem)] lg:self-start lg:overflow-y-auto">
        <div className="rounded-[var(--r-lg)] border border-border bg-surface">
          <div className="border-b border-border p-5">
            <h2 className="text-sm font-semibold">{dict.learn.outline}</h2>
            <p className="tnum mt-2 text-xs text-fg-subtle">
              {formatRatio(locale, outline.lessonsCompleted, outline.lessonsTotal)}
            </p>
            <Progress
              value={outline.progressPercent}
              label={dict.learn.progress}
              className="mt-2"
            />
          </div>

          {outline.modules.map((module) => (
            <div key={module.id} className="border-b border-border last:border-b-0">
              <h3 className="px-5 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                {module.title}
              </h3>
              <ul className="pb-2">
                {module.lessons.map((item) => {
                  const active = item.slug === lessonSlug;
                  const done = item.status === "completed";
                  const body = (
                    <>
                      <span className="mt-0.5 shrink-0">
                        {done ? (
                          <CheckCircleIcon
                            size={17}
                            weight="fill"
                            className="text-primary"
                            aria-hidden
                          />
                        ) : item.locked ? (
                          <LockSimpleIcon size={17} className="text-fg-subtle" aria-hidden />
                        ) : (
                          <PlayCircleIcon size={17} className="text-fg-subtle" aria-hidden />
                        )}
                      </span>
                      <span className="flex-1 text-[0.9rem] leading-snug">{item.title}</span>
                    </>
                  );
                  return (
                    <li key={item.id}>
                      {item.locked ? (
                        <div className="flex gap-3 px-5 py-2.5 text-fg-subtle">{body}</div>
                      ) : (
                        <Link
                          href={`/${locale}/learn/${outline.slug}/${item.slug}`}
                          aria-current={active ? "page" : undefined}
                          className={`flex gap-3 border-s-2 px-5 py-2.5 transition-colors duration-200 ${
                            active
                              ? "border-s-primary bg-primary-soft text-fg"
                              : "border-s-transparent text-fg-muted hover:bg-surface-2 hover:text-fg"
                          }`}
                        >
                          {body}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function Gate({
  locale,
  dict,
  code,
  courseSlug,
  lessonSlug,
}: {
  locale: Locale;
  dict: Awaited<ReturnType<typeof getDict>>;
  code: string;
  courseSlug: string;
  lessonSlug: string;
}) {
  const needsAuth = code === "auth.unauthenticated";
  const expired = code === "access.expired";

  const title = needsAuth
    ? dict.learn.authTitle
    : expired
      ? dict.learn.expiredTitle
      : dict.learn.paywallTitle;
  const body = needsAuth
    ? dict.learn.authBody
    : expired
      ? dict.learn.expiredBody
      : dict.learn.paywallBody;

  // Signing in must return the visitor to the lesson they clicked, not to a
  // dashboard that makes them find it again.
  const href = needsAuth
    ? `/${locale}/login?next=${encodeURIComponent(`/${locale}/learn/${courseSlug}/${lessonSlug}`)}`
    : `/${locale}/checkout/${courseSlug}`;

  return (
    <div className="rounded-[var(--r-xl)] border border-border bg-surface p-8 text-center sm:p-14">
      <span className="mx-auto grid size-14 place-items-center rounded-[var(--r-lg)] bg-primary-soft text-primary">
        {needsAuth ? (
          <SignInIcon size={26} className="flip-rtl" aria-hidden />
        ) : (
          <LockSimpleIcon size={26} aria-hidden />
        )}
      </span>
      <h1 className="mt-5 text-2xl font-bold">{title}</h1>
      <p className="mx-auto mt-3 max-w-[46ch] text-fg-muted">{body}</p>
      <ButtonLink href={href} size="lg" className="mt-7">
        {needsAuth ? dict.learn.authCta : dict.course.enroll}
      </ButtonLink>
    </div>
  );
}
