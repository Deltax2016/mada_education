import { notFound, redirect } from "next/navigation";
import { api } from "@/lib/api";
import { getDict, isLocale, type Locale } from "@/lib/i18n";
import { CreateCourseForm } from "./CreateCourseForm";

type Category = { id: string; slug: string; title: string };
type Status = { isInstructor: boolean };

export default async function NewCoursePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = await getDict(locale);

  const status = await api<Status>("/teach/status", { locale }).catch(() => null);
  if (!status?.isInstructor) redirect(`/${locale}/teach`);

  const categories = await api<Category[]>("/catalog/categories", { locale }).catch(() => []);

  return (
    <div className="mx-auto max-w-[640px] px-5 py-12 sm:px-8 lg:py-16">
      <h1 className="text-[1.8rem] font-bold leading-tight">{dict.teach.createTitle}</h1>
      <p className="mt-2 text-fg-muted">{dict.teach.createSub}</p>
      <CreateCourseForm locale={locale} dict={dict} categories={categories} />
    </div>
  );
}
