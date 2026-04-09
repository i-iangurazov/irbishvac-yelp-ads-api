import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    <Card className="border-dashed border-border/80 bg-muted/10 shadow-none">
      <CardHeader className="p-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <CardDescription className="max-w-lg text-sm leading-5">{description}</CardDescription>
      </CardHeader>
      {action ? <CardContent className="p-4 pt-0">{action}</CardContent> : null}
    </Card>
  );
}
