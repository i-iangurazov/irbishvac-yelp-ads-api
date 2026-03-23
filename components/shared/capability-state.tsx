import { AlertTriangle, CheckCircle2, KeyRound } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function CapabilityState({
  enabled,
  message
}: {
  enabled: boolean;
  message?: string | null;
}) {
  return (
    <Card className={enabled ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/10"}>
      <CardContent className="flex items-start gap-3 p-4">
        {enabled ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" /> : <KeyRound className="mt-0.5 h-5 w-5 text-warning" />}
        <div>
          <div className="font-medium">{enabled ? "Enabled" : "Not enabled"}</div>
          <div className="text-sm text-muted-foreground">{message ?? (enabled ? "Configured and available." : "Not enabled by Yelp / missing credentials.")}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex items-start gap-3 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
        <div className="text-sm">{message}</div>
      </CardContent>
    </Card>
  );
}
