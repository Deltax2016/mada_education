import { notFound } from "next/navigation";
import { QuizRunner } from "@/components/quiz/QuizRunner";
import { getDict, isLocale, type Locale } from "@/lib/i18n";

export default async function QuizPage({
  params,
}: {
  params: Promise<{ locale: string; course: string; quizId: string }>;
}) {
  const { locale: raw, course, quizId } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = await getDict(locale);

  return (
    <div className="mx-auto max-w-[820px] px-5 py-10 sm:px-8">
      <QuizRunner
        quizId={quizId}
        locale={locale}
        dict={dict}
        backHref={`/${locale}/courses/${course}`}
      />
    </div>
  );
}
