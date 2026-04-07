"use client";

import { useEffect, useRef } from "react";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/shared/status-chip";
import { apiFetch } from "@/lib/utils/client-api";
import { summarizeYelpJobIssue } from "@/lib/yelp/job-status";

export function JobStatusPoller({ jobId }: { jobId: string }) {
  const router = useRouter();
  const lastRefreshedTerminalStatus = useRef<string | null>(null);
  const query = useQuery({
    queryKey: ["job", jobId],
    queryFn: () =>
      apiFetch<{ status: string; upstreamJobId?: string | null; responseJson?: unknown; errorJson?: unknown }>(
        `/api/jobs/${jobId}`
      ),
    refetchInterval: (queryData) =>
      queryData.state.data?.status === "QUEUED" || queryData.state.data?.status === "PROCESSING" ? 4_000 : false
  });

  useEffect(() => {
    const status = query.data?.status;

    if (!status || status === "QUEUED" || status === "PROCESSING") {
      lastRefreshedTerminalStatus.current = null;
      return;
    }

    if (lastRefreshedTerminalStatus.current === status) {
      return;
    }

    lastRefreshedTerminalStatus.current = status;
    router.refresh();
  }, [query.data?.status, router]);

  if (query.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Latest Yelp job</CardTitle>
          <CardDescription>Job polling hit an application error before the latest status could be shown.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {query.error instanceof Error ? query.error.message : "Could not refresh the latest Yelp job status."}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!query.data) {
    return null;
  }

  const rawPayload = query.data.errorJson ?? query.data.responseJson ?? {};
  const issue = summarizeYelpJobIssue(rawPayload);
  const serializedPayload = JSON.stringify(rawPayload, null, 2);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Latest Yelp job</CardTitle>
        <CardDescription>Refreshes until Yelp returns a final job state.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 overflow-hidden">
        <div className="flex min-w-0 items-center gap-3">
          <StatusChip status={query.data.status} />
          <span className="truncate text-sm text-muted-foreground">{query.data.upstreamJobId ?? "Local-only job"}</span>
        </div>
        {issue ? (
          <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium text-destructive">{issue.title}</div>
              {issue.code ? <Badge variant="destructive">{issue.code}</Badge> : null}
            </div>
            <div className="text-sm text-muted-foreground">{issue.description}</div>
            {issue.rawMessage ? (
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-background/70 p-3 text-xs text-muted-foreground">
                Yelp: {issue.rawMessage}
              </pre>
            ) : null}
          </div>
        ) : null}
        <details className="rounded-lg border border-border bg-muted/30">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
            Payload
          </summary>
          <div className="border-t border-border px-4 py-3">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
              {serializedPayload}
            </pre>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
