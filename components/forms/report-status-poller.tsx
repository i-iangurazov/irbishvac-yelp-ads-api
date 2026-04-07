"use client";

import { useQuery } from "@tanstack/react-query";

import { StatusChip } from "@/components/shared/status-chip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/utils/client-api";

export function ReportStatusPoller({ reportId }: { reportId: string }) {
  const query = useQuery({
    queryKey: ["report", reportId],
    queryFn: () => apiFetch<{ status: string; upstream?: unknown }>(`/api/reports/${reportId}?poll=true`),
    refetchInterval: (queryData) =>
      queryData.state.data?.status === "REQUESTED" || queryData.state.data?.status === "PROCESSING" ? 5_000 : false
  });

  if (!query.data) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Report generation</CardTitle>
        <CardDescription>Refreshes while Yelp finishes the delayed batch request.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <StatusChip status={query.data.status} />
        {query.data.upstream ? (
          <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
            {JSON.stringify(query.data.upstream, null, 2)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}
