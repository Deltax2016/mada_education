/**
 * Fills from the start edge, so it grows right to left in Arabic without any
 * extra logic. Using `left` here would look correct in English and wrong in Arabic.
 */
export function Progress({
  value,
  label,
  className = "",
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-surface-3 ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full bg-primary transition-[inline-size] duration-500"
        style={{ inlineSize: `${clamped}%` }}
      />
    </div>
  );
}
