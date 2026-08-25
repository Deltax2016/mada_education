"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRightIcon,
  EyeIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { MediaUpload } from "@/components/media/MediaUpload";
import { formatNumber, type Dict, type Locale } from "@/lib/i18n";

export type EditorLesson = {
  id: string;
  slug: string;
  title: Record<string, string>;
  type: string;
  position: number;
  durationMinutes: number;
  isPreview: boolean;
  status: string;
  filledLocales: string[];
};

export type EditorCourse = {
  slug: string;
  status: string;
  coverUrl: string | null;
  title: Record<string, string>;
  subtitle: Record<string, string>;
  isFree: boolean;
  priceMinor: number;
  currency: string;
  studentsCount: number;
  modules: {
    id: string;
    title: Record<string, string>;
    position: number;
    lessons: EditorLesson[];
  }[];
};

export function CourseEditor({
  locale,
  dict,
  initial,
}: {
  locale: Locale;
  dict: Dict;
  initial: EditorCourse;
}) {
  const router = useRouter();
  const [course, setCourse] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<{ problems: string[]; emptyLessons: string[] } | null>(
    null,
  );
  const [newModule, setNewModule] = useState("");
  const [newLesson, setNewLesson] = useState<Record<string, string>>({});

  async function refresh() {
    const res = await fetch(`/api/proxy/teach/courses/${course.slug}?locale=${locale}`);
    if (res.ok) setCourse(await res.json());
    router.refresh();
  }

  async function call(path: string, init: RequestInit) {
    setBusy(true);
    try {
      const res = await fetch(`/api/proxy${path}`, init);
      const data = res.headers.get("content-type")?.includes("json") ? await res.json() : {};
      return { ok: res.ok, data };
    } finally {
      setBusy(false);
    }
  }

  async function addModule(event: React.FormEvent) {
    event.preventDefault();
    if (!newModule.trim()) return;
    await call(`/teach/courses/${course.slug}/modules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titleAr: newModule, titleEn: newModule }),
    });
    setNewModule("");
    await refresh();
  }

  async function addLesson(moduleId: string) {
    const title = (newLesson[moduleId] ?? "").trim();
    if (!title) return;
    await call(`/teach/modules/${moduleId}/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titleAr: title, titleEn: title, durationMinutes: 10 }),
    });
    setNewLesson((s) => ({ ...s, [moduleId]: "" }));
    await refresh();
  }

  async function removeLesson(id: string) {
    if (!confirm(dict.teach.confirmDelete)) return;
    await call(`/teach/lessons/${id}`, { method: "DELETE" });
    await refresh();
  }

  async function removeModule(id: string) {
    if (!confirm(dict.teach.confirmDelete)) return;
    const { ok } = await call(`/teach/modules/${id}`, { method: "DELETE" });
    if (!ok) alert(dict.teach.deleteModule);
    await refresh();
  }

  async function togglePreview(lesson: EditorLesson) {
    await call(`/teach/lessons/${lesson.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPreview: !lesson.isPreview }),
    });
    await refresh();
  }

  async function publish() {
    setBlocked(null);
    const { ok, data } = await call(`/teach/courses/${course.slug}/publish`, { method: "POST" });
    if (!ok) {
      setBlocked({
        problems: (data.meta?.problems as string[]) ?? [],
        emptyLessons: (data.meta?.emptyLessons as string[]) ?? [],
      });
      return;
    }
    await refresh();
  }

  async function unpublish() {
    await call(`/teach/courses/${course.slug}/unpublish`, { method: "POST" });
    await refresh();
  }

  async function setCover({ url }: { url: string | null }) {
    if (!url) return;
    await call(`/teach/courses/${course.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverUrl: url }),
    });
    await refresh();
  }

  const lessonCount = course.modules.reduce((n, m) => n + m.lessons.length, 0);

  return (
    <div className="mx-auto max-w-[900px] px-5 py-10 sm:px-8 lg:py-14">
      <Link
        href={`/${locale}/teach`}
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowRightIcon size={15} className="rotate-180 flip-rtl" aria-hidden />
        {dict.teach.backToCourses}
      </Link>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={course.status === "published" ? "primary" : "warning"}>
              {course.status === "published" ? dict.teach.published : dict.teach.draft}
            </Badge>
            <span className="tnum text-xs text-fg-subtle">
              {formatNumber(locale, lessonCount)} {dict.teach.lessons}
            </span>
          </div>
          <h1 className="mt-2 text-[1.7rem] font-bold leading-tight">
            {course.title[locale] || course.title.ar || course.slug}
          </h1>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Link
            href={`/${locale}/courses/${course.slug}`}
            className="inline-flex h-9 items-center gap-2 rounded-[var(--r-sm)] px-3.5 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <EyeIcon size={16} aria-hidden />
            {dict.course.preview}
          </Link>
          <Link
            href={`/${locale}/teach/courses/${course.slug}/students`}
            className="inline-flex h-9 items-center gap-2 rounded-[var(--r-sm)] px-3.5 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <UsersThreeIcon size={16} aria-hidden />
            {dict.teach.viewStudents}
          </Link>
          {course.status === "published" ? (
            <Button variant="secondary" size="sm" onClick={unpublish} disabled={busy}>
              {dict.teach.unpublish}
            </Button>
          ) : (
            <Button size="sm" onClick={publish} disabled={busy}>
              {dict.teach.publish}
            </Button>
          )}
        </div>
      </div>

      {blocked ? (
        <div className="mt-6 rounded-[var(--r-md)] border border-border bg-warning-soft p-4 text-sm text-warning">
          <p className="font-semibold">{dict.teach.publishBlocked}</p>
          <ul className="mt-2 space-y-1">
            {blocked.problems.includes("no_lessons") ? <li>{dict.teach.problemNoLessons}</li> : null}
            {blocked.problems.includes("title_ar") || blocked.problems.includes("subtitle_ar") ? (
              <li>{dict.teach.problemTitle}</li>
            ) : null}
            {blocked.emptyLessons.length ? (
              <li>
                {dict.teach.problemEmptyLessons}{" "}
                <span className="ltr-island font-medium">{blocked.emptyLessons.join(", ")}</span>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <section className="mt-8 flex flex-col gap-4 rounded-[var(--r-lg)] border border-border bg-surface p-5 sm:flex-row sm:items-center">
        <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-[var(--r-md)] bg-surface-2 sm:w-52">
          {course.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={course.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">
            {course.coverUrl ? dict.media.replaceCover : dict.media.uploadCover}
          </h2>
          <p className="mt-1 text-xs text-fg-subtle">{dict.media.coverHint}</p>
          <div className="mt-3">
            <MediaUpload
              kind="image"
              dict={dict}
              label={course.coverUrl ? dict.media.replaceCover : dict.media.uploadCover}
              onUploaded={setCover}
            />
          </div>
        </div>
      </section>

      <h2 className="mt-10 text-lg font-semibold">{dict.teach.curriculum}</h2>

      <div className="mt-4 grid gap-4">
        {course.modules.map((module) => (
          <section key={module.id} className="rounded-[var(--r-lg)] border border-border bg-surface">
            <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <h3 className="font-semibold">{module.title[locale] || module.title.ar}</h3>
              <button
                onClick={() => removeModule(module.id)}
                aria-label={dict.teach.deleteModule}
                className="grid size-9 cursor-pointer place-items-center rounded-[var(--r-sm)] text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <TrashIcon size={16} aria-hidden />
              </button>
            </header>

            <ul className="divide-y divide-border">
              {module.lessons.map((lesson) => (
                <li key={lesson.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="tnum w-6 shrink-0 text-xs text-fg-subtle">
                    {formatNumber(locale, lesson.position)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.95rem]">
                    {lesson.title[locale] || lesson.title.ar}
                  </span>

                  <Badge tone={lesson.filledLocales.length ? "primary" : "warning"}>
                    {lesson.filledLocales.length
                      ? lesson.filledLocales.join(" · ").toUpperCase()
                      : dict.teach.empty}
                  </Badge>

                  <button
                    onClick={() => togglePreview(lesson)}
                    className={`h-8 cursor-pointer rounded-[var(--r-sm)] px-2.5 text-xs font-medium transition-colors ${
                      lesson.isPreview
                        ? "bg-primary-soft text-primary"
                        : "text-fg-subtle hover:bg-surface-2"
                    }`}
                  >
                    {dict.teach.preview}
                  </button>

                  <Link
                    href={`/${locale}/teach/lessons/${lesson.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-sm)] border border-border px-2.5 text-xs font-medium transition-colors hover:border-border-strong hover:bg-surface-2"
                  >
                    <PencilSimpleIcon size={14} aria-hidden />
                    {dict.teach.edit}
                  </Link>

                  <button
                    onClick={() => removeLesson(lesson.id)}
                    aria-label={dict.teach.deleteLesson}
                    className="grid size-8 cursor-pointer place-items-center rounded-[var(--r-sm)] text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                  >
                    <TrashIcon size={15} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex gap-2.5 border-t border-border p-4">
              <input
                aria-label={dict.teach.lessonTitle}
                placeholder={dict.teach.lessonTitle}
                className={`${inputClass} h-10`}
                value={newLesson[module.id] ?? ""}
                onChange={(e) => setNewLesson((s) => ({ ...s, [module.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLesson(module.id);
                  }
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => addLesson(module.id)}
                disabled={busy || !(newLesson[module.id] ?? "").trim()}
              >
                <PlusIcon size={15} weight="bold" aria-hidden />
                {dict.teach.addLesson}
              </Button>
            </div>
          </section>
        ))}
      </div>

      <form onSubmit={addModule} className="mt-6 flex gap-2.5">
        <Field label={dict.teach.moduleTitle} htmlFor="newModule">
          <input
            id="newModule"
            className={inputClass}
            placeholder={dict.teach.moduleTitle}
            value={newModule}
            onChange={(e) => setNewModule(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="secondary" className="mt-7 h-12" disabled={busy || !newModule.trim()}>
          <PlusIcon size={16} weight="bold" aria-hidden />
          {dict.teach.addModule}
        </Button>
      </form>
    </div>
  );
}
