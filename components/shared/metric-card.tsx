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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardDescription>{title}</CardDescription>
          <CardTitle className="mt-2 text-3xl">{value}</CardTitle>
        </div>
        {icon}
      </CardHeader>
      {description ? <CardContent className="pt-0 text-sm text-muted-foreground">{description}</CardContent> : null}
    </Card>
  );
}
