import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { getDict, isLocale, type Locale } from "@/lib/i18n";
import { CourseEditor, type EditorCourse } from "./CourseEditor";

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = await getDict(locale);

  const course = await api<EditorCourse>(`/teach/courses/${slug}`, { locale }).catch(() => null);
  if (!course) notFound();

  return <CourseEditor locale={locale} dict={dict} initial={course} />;
}
