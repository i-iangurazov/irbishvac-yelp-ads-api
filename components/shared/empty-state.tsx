import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 px-4 py-4">
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 max-w-lg text-sm leading-5 text-muted-foreground">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
