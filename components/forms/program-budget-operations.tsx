"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
  bidStrategyOperationSchema,
  currentBudgetOperationSchema,
  scheduledBudgetOperationSchema,
  type BidStrategyOperationValues,
  type CurrentBudgetOperationValues,
  type ScheduledBudgetOperationValues
} from "@/features/ads-programs/schemas";
import { apiFetch } from "@/lib/utils/client-api";
import { formatCurrency, formatDateTime, formatInteger, parseCurrencyToCents, titleCase } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

function centsPreview(value: string | undefined) {
  if (!value) {
    return "0";
  }

  try {
    return formatInteger(parseCurrencyToCents(value));
  } catch {
    return "0";
  }
}

export function ProgramBudgetOperations({
  programId,
  currency,
  currentBudgetCents,
  currentMaxBidCents,
  currentPacingMethod,
  isAutobid,
  scheduledBudgetDollars,
  scheduledBudgetEffectiveDate
}: {
  programId: string;
  currency: string;
  currentBudgetCents: number | null;
  currentMaxBidCents: number | null;
  currentPacingMethod: string | null;
  isAutobid: boolean | null;
  scheduledBudgetDollars?: string;
  scheduledBudgetEffectiveDate?: string;
}) {
  const router = useRouter();
  const currentBudgetForm = useForm<CurrentBudgetOperationValues>({
    resolver: zodResolver(currentBudgetOperationSchema),
    defaultValues: {
      operation: "CURRENT_BUDGET",
      currentBudgetDollars: currentBudgetCents ? String(currentBudgetCents / 100) : "",
      internalNote: ""
    }
  });
  const scheduledBudgetForm = useForm<ScheduledBudgetOperationValues>({
    resolver: zodResolver(scheduledBudgetOperationSchema),
    defaultValues: {
      operation: "SCHEDULED_BUDGET",
      scheduledBudgetDollars: scheduledBudgetDollars ?? "",
      scheduledBudgetEffectiveDate: scheduledBudgetEffectiveDate ?? "",
      internalNote: ""
    }
  });
  const bidStrategyForm = useForm<BidStrategyOperationValues>({
    resolver: zodResolver(bidStrategyOperationSchema),
    defaultValues: {
      operation: "BID_STRATEGY",
      pacingMethod: (currentPacingMethod as "paced" | "unpaced" | undefined) ?? "paced",
      maxBidDollars: currentMaxBidCents ? String(currentMaxBidCents / 100) : "",
      internalNote: ""
    }
  });

  async function submitOperation(payload: CurrentBudgetOperationValues | ScheduledBudgetOperationValues | BidStrategyOperationValues) {
    try {
      const result = await apiFetch<{ programId: string; jobId: string }>(`/api/programs/${programId}/budget`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      toast.success("Budget change submitted to Yelp.");
      router.push(`/programs/${result.programId}?jobId=${result.jobId}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit budget change.");
    }
  }

  const currentBudgetValue = currentBudgetForm.watch("currentBudgetDollars");
  const scheduledBudgetValue = scheduledBudgetForm.watch("scheduledBudgetDollars");
  const scheduledDateValue = scheduledBudgetForm.watch("scheduledBudgetEffectiveDate");
  const bidPacingValue = bidStrategyForm.watch("pacingMethod");
  const bidMaxValue = bidStrategyForm.watch("maxBidDollars");

  return (
    <Card id="budget-operations">
      <CardHeader>
        <CardTitle>Budget operations</CardTitle>
        <CardDescription>
          Update current budget, schedule a future budget, or adjust pacing and bid settings for this CPC program.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border p-4">
            <div className="text-sm text-muted-foreground">Current budget</div>
            <div className="mt-1 text-lg font-semibold">{formatCurrency(currentBudgetCents, currency)}</div>
          </div>
          <div className="rounded-lg border border-border p-4">
            <div className="text-sm text-muted-foreground">Bid mode</div>
            <div className="mt-1 text-lg font-semibold">{isAutobid ? "Yelp autobid" : "Manual max bid"}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {isAutobid ? "Max bid changes are disabled while autobid is active." : `Current max bid ${formatCurrency(currentMaxBidCents, currency)}`}
            </div>
          </div>
          <div className="rounded-lg border border-border p-4">
            <div className="text-sm text-muted-foreground">Scheduled budget</div>
            {scheduledBudgetDollars && scheduledBudgetEffectiveDate ? (
              <>
                <div className="mt-1 text-lg font-semibold">
                  {formatCurrency(parseCurrencyToCents(scheduledBudgetDollars), currency)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Effective {formatDateTime(scheduledBudgetEffectiveDate, "MMM d, yyyy")}</div>
              </>
            ) : (
              <div className="mt-1 text-lg font-semibold">None scheduled</div>
            )}
          </div>
        </div>

        <Tabs defaultValue="current">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="current">Current budget</TabsTrigger>
            <TabsTrigger value="scheduled">Schedule budget</TabsTrigger>
            <TabsTrigger value="bid">Bid and pacing</TabsTrigger>
          </TabsList>

          <TabsContent value="current">
            <form className="space-y-4" onSubmit={currentBudgetForm.handleSubmit(submitOperation)}>
              <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <div className="space-y-2">
                  <Label htmlFor="currentBudgetDollars">New monthly budget</Label>
                  <Input id="currentBudgetDollars" placeholder="325.00" {...currentBudgetForm.register("currentBudgetDollars")} />
                  <p className="text-xs text-muted-foreground">Yelp payload: `budget={centsPreview(currentBudgetValue)}` cents.</p>
                  {currentBudgetForm.formState.errors.currentBudgetDollars ? (
                    <p className="text-sm text-destructive">{currentBudgetForm.formState.errors.currentBudgetDollars.message}</p>
                  ) : null}
                </div>
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="font-medium">Diff preview</div>
                  <div className="mt-2 text-sm text-muted-foreground">Current: {formatCurrency(currentBudgetCents, currency)}</div>
                  <div className="text-sm text-muted-foreground">
                    Proposed: {formatCurrency(currentBudgetValue ? parseCurrencyToCents(currentBudgetValue) : null, currency)}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="currentInternalNote">Internal note</Label>
                <Textarea id="currentInternalNote" placeholder="Why this budget change is being requested." {...currentBudgetForm.register("internalNote")} />
              </div>
              <Button type="submit" disabled={currentBudgetForm.formState.isSubmitting}>
                {currentBudgetForm.formState.isSubmitting ? "Submitting..." : "Submit budget change"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="scheduled">
            <form className="space-y-4" onSubmit={scheduledBudgetForm.handleSubmit(submitOperation)}>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="scheduledBudgetDollars">Future monthly budget</Label>
                  <Input id="scheduledBudgetDollars" placeholder="425.00" {...scheduledBudgetForm.register("scheduledBudgetDollars")} />
                  <p className="text-xs text-muted-foreground">Yelp budget payload: {centsPreview(scheduledBudgetValue)} cents.</p>
                  {scheduledBudgetForm.formState.errors.scheduledBudgetDollars ? (
                    <p className="text-sm text-destructive">{scheduledBudgetForm.formState.errors.scheduledBudgetDollars.message}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scheduledBudgetEffectiveDate">Effective date</Label>
                  <Input id="scheduledBudgetEffectiveDate" type="date" {...scheduledBudgetForm.register("scheduledBudgetEffectiveDate")} />
                  <p className="text-xs text-muted-foreground">Yelp date payload: {scheduledDateValue || "not set"}.</p>
                  {scheduledBudgetForm.formState.errors.scheduledBudgetEffectiveDate ? (
                    <p className="text-sm text-destructive">{scheduledBudgetForm.formState.errors.scheduledBudgetEffectiveDate.message}</p>
                  ) : null}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <div className="font-medium">Diff preview</div>
                <div className="mt-2 text-sm text-muted-foreground">Current budget: {formatCurrency(currentBudgetCents, currency)}</div>
                <div className="text-sm text-muted-foreground">
                  Scheduled budget: {formatCurrency(scheduledBudgetValue ? parseCurrencyToCents(scheduledBudgetValue) : null, currency)}
                </div>
                <div className="text-sm text-muted-foreground">Effective on: {scheduledDateValue || "Not set"}</div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduledInternalNote">Internal note</Label>
                <Textarea id="scheduledInternalNote" placeholder="Why this future budget change is being scheduled." {...scheduledBudgetForm.register("internalNote")} />
              </div>
              <Button type="submit" disabled={scheduledBudgetForm.formState.isSubmitting}>
                {scheduledBudgetForm.formState.isSubmitting ? "Submitting..." : "Schedule budget change"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="bid">
            <form className="space-y-4" onSubmit={bidStrategyForm.handleSubmit(submitOperation)}>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pacingMethod">Pacing method</Label>
                  <select
                    id="pacingMethod"
                    className="ui-native-select"
                    {...bidStrategyForm.register("pacingMethod")}
                  >
                    <option value="paced">Paced</option>
                    <option value="unpaced">Unpaced</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxBidDollars">Max bid</Label>
                  <Input
                    id="maxBidDollars"
                    placeholder="12.50"
                    disabled={Boolean(isAutobid)}
                    {...bidStrategyForm.register("maxBidDollars")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isAutobid
                      ? "This program currently uses Yelp autobid."
                      : `Yelp max_bid payload: ${centsPreview(bidMaxValue)} cents.`}
                  </p>
                  {bidStrategyForm.formState.errors.maxBidDollars ? (
                    <p className="text-sm text-destructive">{bidStrategyForm.formState.errors.maxBidDollars.message}</p>
                  ) : null}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <div className="font-medium">Diff preview</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline">Current pacing: {titleCase(currentPacingMethod ?? "paced")}</Badge>
                  <Badge variant="outline">Proposed pacing: {titleCase(bidPacingValue)}</Badge>
                  <Badge variant="outline">Current max bid: {formatCurrency(currentMaxBidCents, currency)}</Badge>
                  <Badge variant="outline">
                    Proposed max bid: {formatCurrency(bidMaxValue ? parseCurrencyToCents(bidMaxValue) : currentMaxBidCents, currency)}
                  </Badge>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bidInternalNote">Internal note</Label>
                <Textarea id="bidInternalNote" placeholder="Explain the reason for the pacing or max-bid change." {...bidStrategyForm.register("internalNote")} />
              </div>
              <Button type="submit" disabled={bidStrategyForm.formState.isSubmitting}>
                {bidStrategyForm.formState.isSubmitting ? "Submitting..." : "Submit bid or pacing change"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
