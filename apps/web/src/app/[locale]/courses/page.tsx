import Link from "next/link";
import { notFound } from "next/navigation";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";

import { CourseCard } from "@/components/CourseCard";
import { Empty } from "@/components/ui/Empty";
import { ButtonLink } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { getDict, isLocale, plural, type Locale } from "@/lib/i18n";
import type { CourseCard as CourseDto } from "@/lib/types";

type Category = { id: string; slug: string; title: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDict(locale);
  return { title: dict.catalog.title, description: dict.catalog.sub };
}

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = await getDict(locale);
  const { q, category } = await searchParams;

  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (category) query.set("category", category);
  const suffix = query.toString() ? `?${query}` : "";

  const [result, categories] = await Promise.all([
    api<{ data: CourseDto[]; total: number }>(`/catalog/courses${suffix}`, { locale }).catch(
      () => ({ data: [], total: 0 }),
    ),
    api<Category[]>("/catalog/categories", { locale, revalidate: 300 }).catch(() => []),
  ]);

  const chip =
    "inline-flex h-10 items-center whitespace-nowrap rounded-[var(--r-md)] border px-4 text-sm font-medium transition-colors duration-200";

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-12 sm:px-8 lg:py-16">
      <header className="max-w-[52ch] ar:ms-auto">
        <h1 className="text-[2rem] font-bold leading-tight sm:text-[2.4rem]">
          {dict.catalog.title}
        </h1>
        <p className="mt-3 text-fg-muted">{dict.catalog.sub}</p>
      </header>

      <form action={`/${locale}/courses`} className="mt-8 max-w-[520px] ar:ms-auto">
        <label htmlFor="q" className="mb-2 block text-sm font-medium">
          {dict.catalog.search}
        </label>
        <div className="relative">
          <MagnifyingGlassIcon
            size={18}
            className="pointer-events-none absolute inset-y-0 start-4 my-auto h-fit text-fg-subtle"
            aria-hidden
          />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q ?? ""}
            placeholder={dict.catalog.searchHint}
            className="h-12 w-full rounded-[var(--r-md)] border border-border-strong bg-surface ps-11 pe-4 text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none focus:ring-4 focus:ring-[var(--primary-ring)]"
          />
          {category ? <input type="hidden" name="category" value={category} /> : null}
        </div>
        <p className="mt-2 text-xs text-fg-subtle">{dict.catalog.searchHint}</p>
      </form>

      <nav
        className="hide-scrollbar mt-7 flex gap-2.5 overflow-x-auto pb-1 ar:justify-end"
        aria-label={dict.catalog.title}
      >
        <Link
          href={`/${locale}/courses${q ? `?q=${encodeURIComponent(q)}` : ""}`}
          className={`${chip} ${
            category
              ? "border-border text-fg-muted hover:border-border-strong hover:text-fg"
              : "border-primary bg-primary-soft text-primary"
          }`}
        >
          {dict.catalog.all}
        </Link>
        {categories.map((item) => {
          const active = category === item.slug;
          const params = new URLSearchParams();
          if (q) params.set("q", q);
          params.set("category", item.slug);
          return (
            <Link
              key={item.id}
              href={`/${locale}/courses?${params}`}
              className={`${chip} ${
                active
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border text-fg-muted hover:border-border-strong hover:text-fg"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {item.title}
            </Link>
          );
        })}
      </nav>

      <p className="mt-8 text-sm text-fg-subtle">
        {plural(locale, result.total, dict.catalog.found)}
      </p>

      {result.data.length === 0 ? (
        <div className="mt-6">
          <Empty
            title={dict.catalog.empty}
            body={dict.catalog.emptyBody}
            action={
              <ButtonLink href={`/${locale}/courses`} variant="secondary" size="sm">
                {dict.catalog.clear}
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {result.data.map((course) => (
            <CourseCard key={course.id} course={course} locale={locale} dict={dict} />
          ))}
        </div>
      )}
    </div>
  );
}
