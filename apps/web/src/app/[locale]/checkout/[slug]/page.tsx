import { notFound, redirect } from "next/navigation";
import { CheckoutPanel } from "./CheckoutPanel";
import { api, ApiError } from "@/lib/api";
import { getDict, isLocale, type Locale } from "@/lib/i18n";
import type { CourseDetail, Me } from "@/lib/types";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const dict = await getDict(locale);

  const me = await api<Me>("/auth/me", { locale }).catch(() => null);
  if (!me) redirect(`/${locale}/login?next=/${locale}/checkout/${slug}`);

  const course = await api<CourseDetail>(`/catalog/courses/${slug}`, { locale }).catch(
    () => null,
  );
  if (!course) notFound();
  if (course.isEnrolled) redirect(`/${locale}/courses/${slug}`);

  // The order is created on the server so the amount, the tax rate and the
  // country are fixed before the browser is involved.
  let order;
  try {
    order = await api<{
      orderId: string;
      subtotal: CourseDetail["price"];
      tax: CourseDetail["price"];
      total: CourseDetail["price"];
      taxRate: number;
      taxCountry: string;
    }>("/billing/orders", {
      locale,
      method: "POST",
      body: { courseSlug: slug, country: "OM" },
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === "order.already_enrolled") {
      redirect(`/${locale}/courses/${slug}`);
    }
    throw error;
  }

  return (
    <div className="mx-auto max-w-[560px] px-5 py-14 sm:px-8">
      <h1 className="text-[1.8rem] font-bold leading-tight">{dict.checkout.title}</h1>
      <p className="mt-2.5 text-fg-muted">{course.title}</p>
      <CheckoutPanel order={order} dict={dict} locale={locale} slug={slug} />
    </div>
  );
}
