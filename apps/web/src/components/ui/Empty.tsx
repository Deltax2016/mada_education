import type { ReactNode } from "react";

export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--r-lg)] border border-dashed border-border-strong px-6 py-14 text-center">
      {icon ? <div className="text-fg-subtle">{icon}</div> : null}
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-[48ch] text-sm text-fg-muted">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
