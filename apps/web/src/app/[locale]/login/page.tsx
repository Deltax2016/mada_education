import { notFound } from "next/navigation";
import { LoginForm } from "./LoginForm";
import { getDict, isLocale, type Locale } from "@/lib/i18n";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = await getDict(locale);
  const { next } = await searchParams;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-var(--nav-h))] max-w-[440px] flex-col justify-center px-5 py-14">
      <h1 className="text-[1.8rem] font-bold leading-tight">{dict.auth.title}</h1>
      <p className="mt-2.5 text-fg-muted">{dict.auth.sub}</p>
      <LoginForm locale={locale} dict={dict} next={next ?? `/${locale}/dashboard`} />
    </div>
  );
}
