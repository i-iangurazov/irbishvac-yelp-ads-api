"use client";

import { useState } from "react";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/utils/client-api";

type LeadAiSummaryResponse = {
  requestId: string;
  generatedAt: string;
  needsHumanReview: boolean;
  warnings: Array<{
    code: string;
    message: string;
  }>;
  summary: {
    customerIntent: string;
    serviceContext: string;
    threadStatus: string;
    partnerLifecycle: string;
    issueNote: string | null;
    missingInfo: string[];
    nextSteps: string[];
  };
};

export function LeadAiSummaryPanel({
  leadId,
  canGenerate,
  modelLabel
}: {
  leadId: string;
  canGenerate: boolean;
  modelLabel: string;
}) {
  const [summary, setSummary] = useState<LeadAiSummaryResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  const generate = async (refresh: boolean) => {
    if (!canGenerate) {
      return;
    }

    setIsGenerating(true);

    try {
      const result = await apiFetch<LeadAiSummaryResponse>(`/api/leads/${leadId}/summary`, {
        method: "POST",
        body: JSON.stringify({
          refresh
        })
      });

      setSummary(result);

      if (result.needsHumanReview || result.warnings.length > 0) {
        toast.warning("AI summary generated with review warnings.");
      } else {
        toast.success(refresh ? "AI lead summary refreshed." : "AI lead summary generated.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to generate the AI lead summary.");
    } finally {
      setIsGenerating(false);
    }
  };

  const dismiss = async () => {
    if (!summary) {
      return;
    }

    setIsDismissing(true);

    try {
      await apiFetch<{ status: string }>(`/api/leads/${leadId}/summary/usage`, {
        method: "POST",
        body: JSON.stringify({
          requestId: summary.requestId,
          action: "DISMISSED"
        })
      });
    } catch {
      // Keep dismiss responsive even if usage audit logging fails.
    } finally {
      setSummary(null);
      setIsDismissing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI lead summary</CardTitle>
        <CardDescription>
          Review-only assist for faster triage. Generated text never changes Yelp-native or partner lifecycle records.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">AI-generated assist</Badge>
          <Badge variant="secondary">Review only</Badge>
          <Badge variant="outline">{modelLabel}</Badge>
        </div>

        {!canGenerate ? (
          <div className="rounded-xl border border-border/80 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
            AI summary generation is not configured for this tenant.
          </div>
        ) : null}

        {summary ? (
          <>
            <div className="grid gap-3 text-sm">
              <div className="rounded-xl border border-border/80 bg-muted/10 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Customer intent
                </div>
                <div className="mt-2">{summary.summary.customerIntent}</div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-border/80 bg-muted/10 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Service and context
                  </div>
                  <div className="mt-2">{summary.summary.serviceContext}</div>
                </div>
                <div className="rounded-xl border border-border/80 bg-muted/10 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Thread status
                  </div>
                  <div className="mt-2">{summary.summary.threadStatus}</div>
                </div>
              </div>

              <div className="rounded-xl border border-border/80 bg-muted/10 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Partner lifecycle
                </div>
                <div className="mt-2">{summary.summary.partnerLifecycle}</div>
                {summary.summary.issueNote ? (
                  <div className="mt-3 text-xs text-muted-foreground">{summary.summary.issueNote}</div>
                ) : null}
              </div>

              {summary.summary.missingInfo.length > 0 ? (
                <div className="rounded-xl border border-border/80 bg-muted/10 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Missing information
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {summary.summary.missingInfo.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {summary.summary.nextSteps.length > 0 ? (
                <div className="rounded-xl border border-border/80 bg-muted/10 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Suggested next steps
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {summary.summary.nextSteps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {summary.warnings.length > 0 ? (
              <div className="space-y-2">
                {summary.warnings.map((warning) => (
                  <div
                    className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
                    key={warning.code}
                  >
                    {warning.message}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button disabled={isGenerating} onClick={() => generate(true)} type="button" variant="outline">
                {isGenerating ? "Refreshing..." : "Regenerate"}
              </Button>
              <Button disabled={isDismissing} onClick={dismiss} type="button" variant="ghost">
                {isDismissing ? "Dismissing..." : "Dismiss"}
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/80 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
              Generate a short operator summary for customer intent, thread state, partner lifecycle, missing info, and suggested next steps.
            </div>
            <Button disabled={!canGenerate || isGenerating} onClick={() => generate(false)} type="button">
              {isGenerating ? "Generating..." : "Generate summary"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
