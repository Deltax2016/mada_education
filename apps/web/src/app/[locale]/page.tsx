import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRightIcon,
  CalendarBlankIcon,
  CertificateIcon,
  CoinsIcon,
  PercentIcon,
  PlusIcon,
} from "@phosphor-icons/react/dist/ssr";

import { ButtonLink } from "@/components/ui/Button";
import { CourseCard } from "@/components/CourseCard";
import { Reveal } from "@/components/Reveal";
import { api } from "@/lib/api";
import { getDict, isLocale, type Locale } from "@/lib/i18n";
import type { CourseCard as CourseDto } from "@/lib/types";

type Category = { id: string; slug: string; title: string };

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = await getDict(locale);

  const [courses, categories] = await Promise.all([
    api<{ data: CourseDto[] }>("/catalog/courses", { locale, revalidate: 300 })
      .then((r) => r.data)
      .catch(() => []),
    api<Category[]>("/catalog/categories", { locale, revalidate: 300 }).catch(() => []),
  ]);

  const featured = courses.slice(0, 5);

  return (
    <>
      {/* Hero: asymmetric split. Copy on the start side, one real photograph on
          the end side. Four text elements at most, and the CTA is above the fold. */}
      <section className="mx-auto grid max-w-[1240px] items-center gap-10 px-5 pb-16 pt-14 sm:px-8 md:grid-cols-[1.05fr_0.95fr] md:gap-14 md:pt-20 lg:pb-24">
        <div>
          <h1 className="text-[2.1rem] font-bold leading-[1.25] text-fg sm:text-[2.6rem] lg:text-[3.1rem]">
            {dict.home.headline}
          </h1>
          <p className="mt-5 max-w-[46ch] text-base leading-relaxed text-fg-muted sm:text-lg">
            {dict.home.sub}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap ar:sm:justify-end">
            <ButtonLink href={`/${locale}/courses`} size="lg" className="w-full sm:w-auto">
              {dict.home.ctaPrimary}
              <ArrowRightIcon size={18} weight="bold" className="flip-rtl" aria-hidden />
            </ButtonLink>
            <ButtonLink
              href={`/${locale}/courses/cybersecurity-essentials`}
              size="lg"
              variant="secondary"
              className="w-full sm:w-auto"
            >
              {dict.home.ctaSecondary}
            </ButtonLink>
          </div>
        </div>

        <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--r-xl)] border border-border bg-surface-2 md:aspect-[5/4]">
          <Image
            src="https://picsum.photos/seed/muscat-professional-training-room/1200/960"
            alt=""
            fill
            priority
            sizes="(max-width: 768px) 100vw, 46vw"
            className="object-cover"
          />
        </div>
      </section>

      {/* Categories: a scroll-snap row, not a card grid. Different layout family
          from everything above and below it. */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-[1240px] px-5 py-7 sm:px-8">
          <h2 className="sr-only">{dict.home.categoriesTitle}</h2>
          <ul className="hide-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 ar:justify-end">
            {categories.map((category) => (
              <li key={category.id} className="snap-start">
                <Link
                  href={`/${locale}/courses?category=${category.slug}`}
                  className="inline-flex h-11 items-center whitespace-nowrap rounded-[var(--r-md)] border border-border px-4 text-sm font-medium text-fg-muted transition-colors duration-200 hover:border-primary hover:bg-primary-soft hover:text-primary"
                >
                  {category.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Featured: bento with exactly as many cells as there are courses.
          One lead card spanning two columns, four supporting cards. */}
      <section className="mx-auto max-w-[1240px] px-5 py-16 sm:px-8 lg:py-24">
        <div className="max-w-[52ch] ar:ms-auto">
          <h2 className="text-[1.75rem] font-bold leading-tight sm:text-[2.1rem]">
            {dict.home.featuredTitle}
          </h2>
          <p className="mt-3 text-fg-muted">{dict.home.featuredSub}</p>
        </div>

        {featured.length > 0 ? (
          <div className="mt-9 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <Reveal className="md:col-span-2 lg:col-span-4">
              <CourseCard course={featured[0]} locale={locale} dict={dict} featured />
            </Reveal>
            {featured.slice(1).map((course, index) => (
              <Reveal key={course.id} delay={0.05 * index}>
                <CourseCard course={course} locale={locale} dict={dict} />
              </Reveal>
            ))}
          </div>
        ) : null}

        <div className="mt-10 ar:flex ar:justify-end">
          <ButtonLink href={`/${locale}/courses`} variant="secondary">
            {dict.home.ctaPrimary}
            <ArrowRightIcon size={16} weight="bold" className="flip-rtl" aria-hidden />
          </ButtonLink>
        </div>
      </section>

      {/* Why a translated course fails here: sticky heading beside a divided
          list. Three specific, checkable facts rather than a description of how
          online courses work. */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-16 sm:px-8 md:grid-cols-[0.85fr_1.15fr] lg:py-24">
          <h2 className="text-[1.75rem] font-bold leading-tight sm:text-[2.1rem] md:sticky md:top-[calc(var(--nav-h)+2rem)] md:self-start">
            {dict.home.gapTitle}
          </h2>

          <ul className="divide-y divide-border">
            {[
              { icon: PercentIcon, title: dict.home.gap1Title, body: dict.home.gap1Body },
              { icon: CoinsIcon, title: dict.home.gap2Title, body: dict.home.gap2Body },
              { icon: CalendarBlankIcon, title: dict.home.gap3Title, body: dict.home.gap3Body },
            ].map(({ icon: Icon, title, body }, index) => (
              <li key={title}>
                <Reveal delay={index * 0.06}>
                  <div className="flex gap-5 py-7 first:pt-0">
                    <span className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-[var(--r-md)] bg-primary-soft text-primary">
                      <Icon size={22} weight="regular" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold">{title}</h3>
                      <p className="mt-1.5 max-w-[52ch] text-fg-muted">{body}</p>
                    </div>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Certificate: full-bleed tinted band, image offset to the end side.
          Same theme as the rest of the page, only a surface tint. */}
      <section className="mx-auto max-w-[1240px] px-5 py-16 sm:px-8 lg:py-24">
        <div className="grid items-center gap-10 rounded-[var(--r-xl)] border border-border bg-surface-2 p-7 sm:p-10 md:grid-cols-[1fr_0.85fr] lg:p-14">
          <div>
            <span className="grid size-12 place-items-center rounded-[var(--r-md)] bg-primary text-on-primary">
              <CertificateIcon size={24} weight="regular" aria-hidden />
            </span>
            <h2 className="mt-5 text-[1.6rem] font-bold leading-tight sm:text-[2rem]">
              {dict.home.certTitle}
            </h2>
            <p className="mt-4 max-w-[50ch] leading-relaxed text-fg-muted">
              {dict.home.certBody}
            </p>
            <ButtonLink href={`/${locale}/verify`} variant="secondary" className="mt-7">
              {dict.home.certCta}
            </ButtonLink>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--r-lg)] border border-border bg-surface">
            <Image
              src="https://picsum.photos/seed/certificate-document-desk-oman/900/675"
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 38vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* FAQ: native disclosure elements, keyboard accessible without any JS. */}
      <section className="mx-auto max-w-[820px] px-5 pb-20 sm:px-8">
        <h2 className="text-[1.75rem] font-bold leading-tight sm:text-[2.1rem]">
          {dict.home.faqTitle}
        </h2>
        <div className="mt-8 divide-y divide-border border-t border-border">
          {[
            [dict.home.faq1Q, dict.home.faq1A],
            [dict.home.faq2Q, dict.home.faq2A],
            [dict.home.faq3Q, dict.home.faq3A],
            [dict.home.faq4Q, dict.home.faq4A],
          ].map(([question, answer]) => (
            <details key={question} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-start font-medium marker:hidden">
                {question}
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-fg-muted transition-transform duration-200 group-open:rotate-45">
                  <PlusIcon size={13} weight="bold" aria-hidden />
                </span>
              </summary>
              <p className="mt-3 max-w-[62ch] leading-relaxed text-fg-muted">{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
