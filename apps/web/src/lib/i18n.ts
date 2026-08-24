export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function dir(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** Intl locale tags. Oman is the primary market, so ar-OM rather than ar-SA. */
export const INTL_TAG: Record<Locale, string> = { ar: "ar-OM", en: "en-GB" };

/**
 * Numbers, money and percentages are formatted with English conventions in both
 * locales, and rendered inside an LTR isolate.
 *
 * Arabic prose runs right to left, but a quantity does not: "0 / 6" reorders to
 * "6 / 0", and a currency symbol jumps to the wrong side of its amount. Keeping
 * every numeric expression identical to the English page is the only way it
 * reads the same to both audiences.
 */
const NUMERIC_TAG = "en-GB";

/**
 * Plural-bearing entries are typed loosely on purpose: Arabic declares six
 * categories and English two, so the two dictionaries are not structurally
 * identical and should not be forced to be.
 */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>;

type RawDict = typeof import("../../messages/ar.json");

export type Dict = Omit<RawDict, "catalog"> & {
  catalog: Omit<RawDict["catalog"], "found" | "lessonCount" | "studentCount"> & {
    found: PluralForms;
    lessonCount: PluralForms;
    studentCount: PluralForms;
  };
};

const dictionaries = {
  ar: () => import("../../messages/ar.json").then((m) => m.default),
  en: () => import("../../messages/en.json").then((m) => m.default),
};

export async function getDict(locale: Locale): Promise<Dict> {
  return dictionaries[locale]() as Promise<Dict>;
}

/**
 * Arabic has six plural categories against English's two. A counter built with
 * a simple `n === 1 ? a : b` reads as broken Arabic on every page it appears.
 */
export function plural(locale: Locale, count: number, forms: PluralForms): string {
  const rule = new Intl.PluralRules(INTL_TAG[locale]).select(count);
  const template = forms[rule] ?? forms.other ?? "";
  return template.replace("#", formatNumber(locale, count));
}

export function formatNumber(_locale: Locale, value: number): string {
  return new Intl.NumberFormat(NUMERIC_TAG, { numberingSystem: "latn" }).format(value);
}

/** Money never arrives as a float. minor + exponent is the only correct shape. */
export function formatMoney(
  _locale: Locale,
  money: { minor: number; currency: string; exponent: number },
): string {
  const value = money.minor / 10 ** money.exponent;
  return new Intl.NumberFormat(NUMERIC_TAG, {
    style: "currency",
    currency: money.currency,
    numberingSystem: "latn",
    minimumFractionDigits: money.exponent,
    maximumFractionDigits: money.exponent,
  }).format(value);
}

/**
 * Percentages go through Intl rather than being glued together as `${n}%`.
 * Inside an Arabic sentence a bare percent sign jumps to the wrong side of the
 * number, so it renders as "%70" instead of "70%". Intl emits the value with
 * the correct bidi handling for the locale.
 */
export function formatPercent(_locale: Locale, value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat(NUMERIC_TAG, {
    style: "percent",
    numberingSystem: "latn",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value / 100);
}

/**
 * Dates keep the locale so the month reads in Arabic, but use Latin digits and
 * a fixed day-month-year order so the parts cannot reorder against the English
 * page.
 */
export function formatDate(locale: Locale, iso: string): string {
  return new Intl.DateTimeFormat(INTL_TAG[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
    numberingSystem: "latn",
  }).format(new Date(iso));
}

/** Hijri is a display layer only. Storage stays UTC gregorian. */
export function formatHijri(iso: string): string {
  return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", {
    dateStyle: "long",
  }).format(new Date(iso));
}

export function formatDuration(locale: Locale, minutes: number, dict: Dict): string {
  if (minutes < 60) return `${formatNumber(locale, minutes)} ${dict.common.min}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = `${formatNumber(locale, hours)} ${dict.common.hour}`;
  return rest ? `${h} ${formatNumber(locale, rest)} ${dict.common.min}` : h;
}

/** "3 / 12" and friends. Written once so it cannot reorder in one place only. */
export function formatRatio(locale: Locale, done: number, total: number): string {
  return `${formatNumber(locale, done)} / ${formatNumber(locale, total)}`;
}
