import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function MetricCard({
  title,
  value,
  description,
  icon
}: {
  title: string;
  value: ReactNode;
  description?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="border-border/80 bg-gradient-to-b from-background to-muted/10 shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 p-4 pb-2">
        <div>
          <CardDescription className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/90">
            {title}
          </CardDescription>
          <CardTitle className="mt-3 text-2xl font-semibold tracking-tight">{value}</CardTitle>
        </div>
        {icon ? <div className="rounded-lg border border-border/80 bg-background/80 p-2">{icon}</div> : null}
      </CardHeader>
      {description ? <CardContent className="px-4 pb-4 pt-0 text-xs leading-5 text-muted-foreground">{description}</CardContent> : null}
    </Card>
  );
}
