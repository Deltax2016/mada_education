import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";

import { Empty } from "@/components/ui/Empty";
import { Progress } from "@/components/ui/Progress";
import { api } from "@/lib/api";
import { formatDate, formatNumber, formatRatio, getDict, isLocale, type Locale } from "@/lib/i18n";

type Row = {
  userId: string;
  name: string;
  email: string;
  status: string;
  lessonsCompleted: number;
  progressPercent: number;
  enrolledAt: string;
  rating: number | null;
};

export default async function StudentsPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = await getDict(locale);

  const result = await api<{ lessonsTotal: number; data: Row[] }>(
    `/teach/courses/${slug}/students`,
    { locale },
  ).catch(() => null);
  if (!result) notFound();

  return (
    <div className="mx-auto max-w-[900px] px-5 py-10 sm:px-8 lg:py-14">
      <Link
        href={`/${locale}/teach/courses/${slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowRightIcon size={15} className="rotate-180 flip-rtl" aria-hidden />
        {dict.teach.editorTitle}
      </Link>

      <h1 className="mt-4 text-[1.8rem] font-bold leading-tight">{dict.teach.studentsTitle}</h1>

      {result.data.length === 0 ? (
        <div className="mt-8">
          <Empty title={dict.teach.noStudents} body={dict.teach.noStudentsBody} />
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-[var(--r-lg)] border border-border">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="bg-surface-2">
                <th scope="col" className="px-5 py-3 text-start font-semibold">
                  {dict.teach.studentName}
                </th>
                <th scope="col" className="px-5 py-3 text-start font-semibold">
                  {dict.teach.studentProgress}
                </th>
                <th scope="col" className="px-5 py-3 text-start font-semibold">
                  {dict.teach.studentEnrolled}
                </th>
                <th scope="col" className="px-5 py-3 text-start font-semibold">
                  {dict.teach.studentRating}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((row) => (
                <tr key={row.userId} className="border-t border-border">
                  <td className="px-5 py-3.5">
                    <div className="font-medium">{row.name}</div>
                    <div className="ltr-island text-xs text-fg-subtle">{row.email}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="tnum text-xs text-fg-muted">
                      {formatRatio(locale, row.lessonsCompleted, result.lessonsTotal)}
                    </div>
                    <Progress value={row.progressPercent} className="mt-1.5 w-28" />
                  </td>
                  <td className="tnum px-5 py-3.5 text-fg-muted">
                    {formatDate(locale, row.enrolledAt)}
                  </td>
                  <td className="tnum px-5 py-3.5 text-fg-muted">
                    {row.rating ? formatNumber(locale, row.rating) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
