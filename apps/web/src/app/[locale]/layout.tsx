import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/styles/globals.css";

// Fonts are self hosted through @fontsource rather than next/font/google.
// next/font/google downloads the woff2 files from fonts.gstatic.com during the
// build, which makes every deployment depend on the build machine reaching
// Google. That is what broke the first deploy. These packages ship the same IBM
// Plex files inside node_modules, so the build needs nothing beyond the registry
// it already uses for every other dependency.
//
// Only the subsets each locale actually needs are imported: arabic for Arabic,
// latin for English, and one mono weight for figures.
import "@fontsource/ibm-plex-sans-arabic/arabic-400.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-500.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-600.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-700.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";

import { Nav } from "@/components/layout/Nav";
import { Footer } from "@/components/layout/Footer";
import { ThemeScript } from "@/components/layout/ThemeScript";
import { api } from "@/lib/api";
import { getDict, isLocale, LOCALES, type Locale } from "@/lib/i18n";
import type { Me } from "@/lib/types";

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
