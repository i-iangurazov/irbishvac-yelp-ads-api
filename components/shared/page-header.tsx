import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 border-b border-border/70 py-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="max-w-3xl text-sm leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        {actions ? (
          <div className="shrink-0 self-start lg:self-auto">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
