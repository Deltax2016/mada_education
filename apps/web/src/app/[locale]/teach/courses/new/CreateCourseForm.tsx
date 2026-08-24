"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, inputClass, selectClass, textareaClass } from "@/components/ui/Field";
import type { Dict, Locale } from "@/lib/i18n";

type Category = { id: string; slug: string; title: string };

/**
 * Turns what the author typed into whole baisa.
 *
 * The rial has three decimals, so "19.9" means 19.900 and not 19.09, and parsing
 * through a float would land on 19899 often enough to matter. Pad the fraction to
 * exactly three digits and treat the whole thing as an integer.
 */
export function toBaisa(input: string): number | null {
  const cleaned = input.trim().replace(/[^\d.]/g, "");
  if (!cleaned) return 0;
  const [whole, fraction = ""] = cleaned.split(".");
  if (fraction.length > 3) return null;
  const padded = (fraction + "000").slice(0, 3);
  const value = Number(whole || "0") * 1000 + Number(padded);
  return Number.isFinite(value) ? value : null;
}

export function CreateCourseForm({
  locale,
  dict,
  categories,
}: {
  locale: Locale;
  dict: Dict;
  categories: Category[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    titleAr: "",
    titleEn: "",
    subtitleAr: "",
    subtitleEn: "",
    categorySlug: categories[0]?.slug ?? "",
    level: "beginner",
    price: "",
    isFree: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const priceMinor = form.isFree ? 0 : toBaisa(form.price);
    if (priceMinor === null) {
      setError(dict.teach.priceHelp);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/proxy/teach/courses?locale=${locale}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titleAr: form.titleAr,
          titleEn: form.titleEn,
          subtitleAr: form.subtitleAr,
          subtitleEn: form.subtitleEn,
          categorySlug: form.categorySlug || null,
          level: form.level,
          priceMinor,
          isFree: form.isFree,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(dict.common.somethingWrong);
        return;
      }
      router.push(`/${locale}/teach/courses/${data.slug}`);
      router.refresh();
    } catch {
      setError(dict.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 grid gap-5">
      <Field label={dict.teach.titleAr} htmlFor="titleAr">
        <input id="titleAr" required minLength={3} className={inputClass}
               value={form.titleAr} onChange={(e) => set("titleAr", e.target.value)} />
      </Field>
      <Field label={dict.teach.titleEn} htmlFor="titleEn">
        <input id="titleEn" required minLength={3} dir="ltr"
               className={`${inputClass} text-start`}
               value={form.titleEn} onChange={(e) => set("titleEn", e.target.value)} />
      </Field>

      <Field label={dict.teach.subtitleAr} htmlFor="subtitleAr">
        <textarea id="subtitleAr" className={textareaClass}
                  value={form.subtitleAr} onChange={(e) => set("subtitleAr", e.target.value)} />
      </Field>
      <Field label={dict.teach.subtitleEn} htmlFor="subtitleEn">
        <textarea id="subtitleEn" dir="ltr" className={`${textareaClass} text-start`}
                  value={form.subtitleEn} onChange={(e) => set("subtitleEn", e.target.value)} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={dict.teach.category} htmlFor="category">
          <select id="category" className={selectClass} value={form.categorySlug}
                  onChange={(e) => set("categorySlug", e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>{c.title}</option>
            ))}
          </select>
        </Field>
        <Field label={dict.teach.level} htmlFor="level">
          <select id="level" className={selectClass} value={form.level}
                  onChange={(e) => set("level", e.target.value)}>
            <option value="beginner">{dict.common.levelBeginner}</option>
            <option value="intermediate">{dict.common.levelIntermediate}</option>
            <option value="advanced">{dict.common.levelAdvanced}</option>
          </select>
        </Field>
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
        <input type="checkbox" className="size-[18px] accent-[var(--primary)]"
               checked={form.isFree} onChange={(e) => set("isFree", e.target.checked)} />
        {dict.teach.makeFree}
      </label>

      {!form.isFree ? (
        <Field label={dict.teach.price} help={dict.teach.priceHelp} htmlFor="price" error={error}>
          <input id="price" inputMode="decimal" dir="ltr" placeholder="19.900"
                 className={`${inputClass} tnum text-start`}
                 value={form.price} onChange={(e) => set("price", e.target.value)} />
        </Field>
      ) : null}

      {error && form.isFree ? (
        <p role="alert" className="text-sm text-danger">{error}</p>
      ) : null}

      <Button type="submit" size="lg" disabled={busy}>
        {busy ? dict.teach.saving : dict.teach.create}
      </Button>
    </form>
  );
}
