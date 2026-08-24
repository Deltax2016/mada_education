import type { ReactNode } from "react";

const control =
  "w-full rounded-[var(--r-md)] border border-border-strong bg-surface px-4 text-fg " +
  "placeholder:text-fg-subtle focus:border-primary focus:outline-none focus:ring-4 " +
  "focus:ring-[var(--primary-ring)] disabled:opacity-50";

export const inputClass = `h-12 ${control}`;
export const textareaClass = `min-h-28 py-3 leading-relaxed ${control}`;
export const selectClass = `h-12 ${control} cursor-pointer`;

/** Label above, helper below. A placeholder is never the label. */
export function Field({
  label,
  help,
  htmlFor,
  error,
  children,
}: {
  label: string;
  help?: string;
  htmlFor: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : help ? (
        <p className="text-xs text-fg-subtle">{help}</p>
      ) : null}
    </div>
  );
}
