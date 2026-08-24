import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IBM_Plex_Sans, IBM_Plex_Sans_Arabic, IBM_Plex_Mono } from "next/font/google";
import "@/styles/globals.css";

import { Nav } from "@/components/layout/Nav";
import { Footer } from "@/components/layout/Footer";
import { ThemeScript } from "@/components/layout/ThemeScript";
import { api } from "@/lib/api";
import { getDict, isLocale, LOCALES, type Locale } from "@/lib/i18n";
import type { Me } from "@/lib/types";

/**
 * IBM Plex Sans Arabic pairs with IBM Plex Sans on the same metrics, so a
 * bilingual page keeps one voice instead of two. Chosen over the usual
 * "creative brief means serif" reflex: this is a working reference product for
 * accountants and engineers, and a naskh serif would read as decorative here.
 */
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

const latin = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-latin",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
  preload: false,
});

/**
 * The shell is personalised: the header shows the signed-in learner, and access
 * checks run per request. Prerendering it would cache a signed-out header and
 * serve it to everyone. Course data is still cached at the fetch level, which is
 * where the actual cost sits.
 */
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDict(locale);
  return {
    title: {
      default: `${dict.common.brand} · ${dict.home.headline}`,
      template: `%s · ${dict.common.brand}`,
    },
    description: dict.home.sub,
    alternates: {
      languages: { ar: "/ar", en: "/en", "x-default": "/ar" },
    },
    icons: { icon: "/favicon.svg" },
    openGraph: {
      title: dict.common.brand,
      description: dict.home.sub,
      locale: locale === "ar" ? "ar_OM" : "en_GB",
      type: "website",
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dict = await getDict(locale as Locale);

  let me: Me | null = null;
  try {
    me = await api<Me>("/auth/me", { locale: locale as Locale });
  } catch {
    me = null;
  }

  return (
    // dir stays "ltr" in both locales on purpose. The Arabic page keeps the
    // English block order - logo left, account right, illustration right - and
    // only the text inside those blocks runs right to left. Flipping the root
    // direction would also reverse every flex row and grid column.
    <html
      lang={locale}
      dir="ltr"
      className={`${arabic.variable} ${latin.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-[100dvh] antialiased">
        {/* Hidden off the top edge rather than shrunk to a 1px box: a 1px
            sr-only element sitting at its static position in RTL pushes the
            document wider than the viewport and gives every mobile page a
            horizontal scrollbar. */}
        <a href="#main" className="skip-link">
          {dict.nav.menu}
        </a>
        <Nav locale={locale as Locale} dict={dict} me={me} />
        <main id="main">{children}</main>
        <Footer locale={locale as Locale} dict={dict} />
      </body>
    </html>
  );
}
