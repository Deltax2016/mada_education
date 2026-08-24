import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { getDict, isLocale, type Locale } from "@/lib/i18n";
import { LessonEditor, type LessonContent } from "./LessonEditor";

export default async function LessonEditorPage({
  params,
}: {
  params: Promise<{ locale: string; lessonId: string }>;
}) {
  const { locale: raw, lessonId } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = await getDict(locale);

  const content = await api<LessonContent>(`/teach/lessons/${lessonId}/content`, {
    locale,
  }).catch(() => null);
  if (!content) notFound();

  return <LessonEditor locale={locale} dict={dict} initial={content} />;
}
