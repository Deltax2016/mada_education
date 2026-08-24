"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircleIcon, ShieldCheckIcon } from "@phosphor-icons/react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { formatMoney, formatPercent, type Dict, type Locale } from "@/lib/i18n";
import type { MoneyDto } from "@/lib/types";

type Order = {
  orderId: string;
  subtotal: MoneyDto;
  tax: MoneyDto;
  total: MoneyDto;
  taxRate: number;
  taxCountry: string;
};

export function CheckoutPanel({
  order,
  dict,
  locale,
  slug,
}: {
  order: Order;
  dict: Dict;
  locale: Locale;
  slug: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "pending" | "paid" | "unavailable">("idle");

  /**
   * Mirrors the real Thawani flow: create the session, leave for the hosted
   * page, come back, and then poll our own API. The return URL never decides
   * that an order is paid; only a server-side status read does.
   */
  async function pay() {
    setState("pending");

    // The server decides whether a purchase is even possible here. Ignoring a
    // refusal and polling anyway is what turns a clear "not available" into a
    // spinner that never resolves.
    const started = await fetch(`/api/proxy/billing/orders/${order.orderId}/checkout`, {
      method: "POST",
    });
    if (!started.ok) {
      setState("unavailable");
      return;
    }

    const settled = await fetch(`/api/proxy/billing/orders/${order.orderId}/settle`, {
      method: "POST",
    });
    if (!settled.ok) {
      setState("unavailable");
      return;
    }

    for (let attempt = 0; attempt < 15; attempt += 1) {
      const res = await fetch(`/api/proxy/billing/orders/${order.orderId}?locale=${locale}`);
      const data = await res.json();
      if (data.status === "paid") {
        setState("paid");
        router.refresh();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    setState("idle");
  }

  if (state === "unavailable") {
    return (
      <div className="mt-8 rounded-[var(--r-lg)] border border-border bg-surface p-7 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-warning-soft text-warning">
          <ShieldCheckIcon size={24} aria-hidden />
        </span>
        <p className="mt-4 font-semibold">{dict.checkout.unavailable}</p>
        <p className="mx-auto mt-2 max-w-[42ch] text-sm text-fg-muted">
          {dict.checkout.unavailableBody}
        </p>
        <ButtonLink href={`/${locale}/courses/${slug}`} variant="secondary" className="mt-6">
          {dict.common.back}
        </ButtonLink>
      </div>
    );
  }

  if (state === "paid") {
    return (
      <div className="mt-8 rounded-[var(--r-lg)] border border-primary bg-primary-soft p-7 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary text-on-primary">
          <CheckCircleIcon size={26} weight="fill" aria-hidden />
        </span>
        <p className="mt-4 font-semibold">{dict.checkout.success}</p>
        <ButtonLink href={`/${locale}/courses/${slug}`} size="lg" className="mt-6">
          {dict.checkout.startLearning}
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-[var(--r-lg)] border border-border bg-surface p-6">
      <dl className="grid gap-3 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-fg-muted">{dict.checkout.subtotal}</dt>
          <dd className="tnum font-medium">{formatMoney(locale, order.subtotal)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-fg-muted">
            {dict.checkout.tax}{" "}
            <span className="tnum text-fg-subtle">
              ({formatPercent(locale, order.taxRate * 100)} {order.taxCountry})
            </span>
          </dt>
          <dd className="tnum font-medium">{formatMoney(locale, order.tax)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
          <dt className="font-semibold">{dict.checkout.total}</dt>
          <dd className="tnum text-lg font-bold">{formatMoney(locale, order.total)}</dd>
        </div>
      </dl>

      <Button size="lg" className="mt-6 w-full" onClick={pay} disabled={state === "pending"}>
        {state === "pending" ? dict.checkout.processing : dict.checkout.pay}
      </Button>

      {state === "pending" ? (
        <p className="mt-3 text-center text-xs text-fg-muted" aria-live="polite">
          {dict.checkout.processingBody}
        </p>
      ) : (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-fg-subtle">
          <ShieldCheckIcon size={14} aria-hidden />
          {dict.checkout.simulateNote}
        </p>
      )}
    </div>
  );
}
