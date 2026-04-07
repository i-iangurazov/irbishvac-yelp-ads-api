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
      <CardHeader className="p-5">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="max-w-xl leading-6">{description}</CardDescription>
      </CardHeader>
      {action ? <CardContent className="p-5 pt-0">{action}</CardContent> : null}
    </Card>
  );
}
