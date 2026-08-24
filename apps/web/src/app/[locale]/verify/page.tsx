import { notFound } from "next/navigation";
import { CheckCircleIcon, SealQuestionIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { formatDate, formatPercent, getDict, isLocale, type Locale } from "@/lib/i18n";

type Verified = {
  serial: string;
  valid: boolean;
  nameAr: string | null;
  nameEn: string | null;
  courseTitle: string;
  issuedAt: string;
  scorePercent: number;
};

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ serial?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = await getDict(locale);
  const { serial } = await searchParams;

  const certificate = serial
    ? await api<Verified>(`/public/verify/${encodeURIComponent(serial)}`, {
        locale,
        token: null,
      }).catch(() => null)
    : null;

  return (
    <div className="mx-auto max-w-[620px] px-5 py-14 sm:px-8">
      <h1 className="text-[1.9rem] font-bold leading-tight">{dict.verify.title}</h1>
      <p className="mt-2.5 text-fg-muted">{dict.verify.sub}</p>

      <form className="mt-8 grid gap-2">
        <label htmlFor="serial" className="text-sm font-medium">
          {dict.verify.serial}
        </label>
        <div className="flex gap-2.5">
          <input
            id="serial"
            name="serial"
            dir="ltr"
            defaultValue={serial ?? ""}
            placeholder="MADA-2026-XXXXXXXX"
            className="tnum h-12 flex-1 rounded-[var(--r-md)] border border-border-strong bg-surface px-4 text-start text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none focus:ring-4 focus:ring-[var(--primary-ring)]"
          />
          <Button type="submit" size="lg">
            {dict.verify.check}
          </Button>
        </div>
      </form>

      {serial && !certificate ? (
        <div className="mt-8 rounded-[var(--r-lg)] border border-border bg-surface p-7 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-surface-2 text-fg-subtle">
            <SealQuestionIcon size={24} aria-hidden />
          </span>
          <p className="mt-4 font-semibold">{dict.verify.notFound}</p>
          <p className="mt-2 text-sm text-fg-muted">{dict.verify.notFoundBody}</p>
        </div>
      ) : null}

      {certificate ? (
        <div className="mt-8 rounded-[var(--r-lg)] border border-primary bg-primary-soft p-7">
          <p className="flex items-center gap-2 font-semibold text-primary">
            <CheckCircleIcon size={20} weight="fill" aria-hidden />
            {dict.verify.valid}
          </p>
          <dl className="mt-5 grid gap-4 text-sm">
            <div>
              <dt className="text-fg-subtle">{dict.verify.holder}</dt>
              <dd className="mt-0.5 text-base font-medium">
                {locale === "ar"
                  ? certificate.nameAr ?? certificate.nameEn
                  : certificate.nameEn ?? certificate.nameAr}
              </dd>
            </div>
            <div>
              <dt className="text-fg-subtle">{dict.verify.course}</dt>
              <dd className="mt-0.5 font-medium">{certificate.courseTitle}</dd>
            </div>
            <div className="flex gap-10">
              <div>
                <dt className="text-fg-subtle">{dict.verify.issued}</dt>
                <dd className="tnum mt-0.5 font-medium">
                  {formatDate(locale, certificate.issuedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-fg-subtle">{dict.verify.score}</dt>
                <dd className="tnum mt-0.5 font-medium">
                  {formatPercent(locale, certificate.scorePercent)}
                </dd>
              </div>
            </div>
            <div>
              <dt className="text-fg-subtle">{dict.dashboard.serial}</dt>
              <dd className="tnum ltr-island mt-0.5 font-medium">{certificate.serial}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
