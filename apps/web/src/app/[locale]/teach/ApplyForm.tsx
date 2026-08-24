"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, inputClass, textareaClass } from "@/components/ui/Field";
import type { Dict, Locale } from "@/lib/i18n";

type Initial = {
  nameAr: string | null;
  nameEn: string | null;
  headline: Record<string, string>;
  bio: Record<string, string>;
} | null;

export function ApplyForm({
  locale,
  dict,
  initial,
}: {
  locale: Locale;
  dict: Dict;
  initial: Initial;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    nameAr: initial?.nameAr ?? "",
    nameEn: initial?.nameEn ?? "",
    headlineAr: initial?.headline?.ar ?? "",
    headlineEn: initial?.headline?.en ?? "",
    bioAr: initial?.bio?.ar ?? "",
    bioEn: initial?.bio?.en ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof form) {
    return (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: event.target.value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/proxy/teach/apply?locale=${locale}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setError(dict.common.somethingWrong);
        return;
      }
      router.refresh();
    } catch {
      setError(dict.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-5 rounded-[var(--r-lg)] border border-border bg-surface p-6 sm:p-7"
    >
      <div>
        <h2 className="text-lg font-semibold">{dict.teach.applyTitle}</h2>
        <p className="mt-1 text-sm text-fg-muted">{dict.teach.applySub}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={dict.teach.nameAr} htmlFor="nameAr">
          <input id="nameAr" required minLength={2} className={inputClass}
                 value={form.nameAr} onChange={set("nameAr")} />
        </Field>
        <Field label={dict.teach.nameEn} help={dict.teach.nameEnHelp} htmlFor="nameEn">
          <input id="nameEn" required minLength={2} dir="ltr"
                 className={`${inputClass} text-start`}
                 value={form.nameEn} onChange={set("nameEn")} />
        </Field>
      </div>

      <Field label={dict.teach.headlineAr} help={dict.teach.headlineHelp} htmlFor="headlineAr">
        <input id="headlineAr" required minLength={4} className={inputClass}
               value={form.headlineAr} onChange={set("headlineAr")} />
      </Field>
      <Field label={dict.teach.headlineEn} htmlFor="headlineEn">
        <input id="headlineEn" required minLength={4} dir="ltr"
               className={`${inputClass} text-start`}
               value={form.headlineEn} onChange={set("headlineEn")} />
      </Field>

      <Field label={dict.teach.bioAr} help={dict.teach.bioHelp} htmlFor="bioAr">
        <textarea id="bioAr" required minLength={40} className={textareaClass}
                  value={form.bioAr} onChange={set("bioAr")} />
      </Field>
      <Field label={dict.teach.bioEn} htmlFor="bioEn">
        <textarea id="bioEn" required minLength={40} dir="ltr"
                  className={`${textareaClass} text-start`}
                  value={form.bioEn} onChange={set("bioEn")} />
      </Field>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={busy}>
        {busy ? dict.teach.saving : dict.teach.submit}
      </Button>
    </form>
  );
}
