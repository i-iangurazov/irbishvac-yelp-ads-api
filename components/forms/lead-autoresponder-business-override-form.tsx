"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  leadConversationAutomationModeOptions,
  leadConversationIntentOptions
} from "@/features/autoresponder/constants";
import {
  leadAutoresponderBusinessOverrideSchema,
  type LeadAutoresponderBusinessOverrideValues
} from "@/features/autoresponder/schemas";
import { apiFetch } from "@/lib/utils/client-api";

export function LeadAutoresponderBusinessOverrideForm({
  businesses,
  initialValues,
  canDelete = false,
  returnPath = "/autoresponder" as Route,
  aiAssistConfigured,
  availableModels
}: {
  businesses: Array<{ id: string; name: string; yelpBusinessId: string | null }>;
  initialValues?: Partial<LeadAutoresponderBusinessOverrideValues> | null;
  canDelete?: boolean;
  returnPath?: Route;
  aiAssistConfigured: boolean;
  availableModels: ReadonlyArray<{ value: string; label: string; description: string }>;
}) {
  const router = useRouter();
  const {
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting }
  } = useForm<LeadAutoresponderBusinessOverrideValues>({
    resolver: zodResolver(leadAutoresponderBusinessOverrideSchema),
    defaultValues: {
      businessId: initialValues?.businessId ?? businesses[0]?.id ?? "",
      isEnabled: initialValues?.isEnabled ?? true,
      defaultChannel: initialValues?.defaultChannel ?? "YELP_THREAD",
      emailFallbackEnabled: initialValues?.emailFallbackEnabled ?? true,
      followUp24hEnabled: initialValues?.followUp24hEnabled ?? false,
      followUp24hDelayHours: initialValues?.followUp24hDelayHours ?? 24,
      followUp7dEnabled: initialValues?.followUp7dEnabled ?? false,
      followUp7dDelayDays: initialValues?.followUp7dDelayDays ?? 7,
      aiAssistEnabled: initialValues?.aiAssistEnabled ?? true,
      aiModel:
        initialValues?.aiModel ??
        (availableModels[0]?.value as LeadAutoresponderBusinessOverrideValues["aiModel"] | undefined) ??
        "gpt-5-nano",
      conversationAutomationEnabled: initialValues?.conversationAutomationEnabled ?? false,
      conversationMode: initialValues?.conversationMode ?? "REVIEW_ONLY",
      conversationAllowedIntents:
        initialValues?.conversationAllowedIntents ?? [
          "MISSING_DETAILS_PROVIDED",
          "BASIC_ACKNOWLEDGMENT",
          "SIMPLE_NEXT_STEP_CLARIFICATION"
        ],
      conversationMaxAutomatedTurns: initialValues?.conversationMaxAutomatedTurns ?? 2,
      conversationReviewFallbackEnabled: initialValues?.conversationReviewFallbackEnabled ?? true,
      conversationEscalateToIssueQueue: initialValues?.conversationEscalateToIssueQueue ?? true
    }
  });
  const isEnabled = watch("isEnabled");
  const followUp24hEnabled = watch("followUp24hEnabled");
  const followUp7dEnabled = watch("followUp7dEnabled");
  const aiAssistEnabled = watch("aiAssistEnabled");
  const conversationAutomationEnabled = watch("conversationAutomationEnabled");
  const conversationMode = watch("conversationMode");
  const conversationAllowedIntents = watch("conversationAllowedIntents");

  const toggleConversationIntent = (
    intent: LeadAutoresponderBusinessOverrideValues["conversationAllowedIntents"][number],
    checked: boolean
  ) => {
    const next = checked
      ? Array.from(new Set([...(conversationAllowedIntents ?? []), intent]))
      : (conversationAllowedIntents ?? []).filter(
          (candidate: LeadAutoresponderBusinessOverrideValues["conversationAllowedIntents"][number]) =>
            candidate !== intent
        );

    setValue("conversationAllowedIntents", next, { shouldValidate: true });
  };

  const submit = handleSubmit(async (values) => {
    try {
      await apiFetch("/api/settings/autoresponder/business-overrides", {
        method: "POST",
        body: JSON.stringify(values)
      });
      toast.success("Business override saved.");
      router.replace(returnPath);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save the business override.");
    }
  });

  const removeOverride = async () => {
    const businessId = watch("businessId");

    if (!canDelete || !businessId) {
      return;
    }

    try {
      await apiFetch(`/api/settings/autoresponder/business-overrides/${businessId}`, {
        method: "DELETE"
      });
      toast.success("Business override removed.");
      router.replace(returnPath);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove the business override.");
    }
  };

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-3">
        <CardTitle>{canDelete ? "Edit override" : "New override"}</CardTitle>
        <CardDescription>Use an override only when one Yelp business needs a different live mode than the tenant default.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={submit}>
          <section className="space-y-4">
            <div>
              <div className="text-sm font-semibold">Scope</div>
              <div className="mt-1 text-xs text-muted-foreground">Choose the Yelp business first, then decide whether this override is live.</div>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
              <div className="space-y-2">
                <Label>Yelp business</Label>
                <Select value={watch("businessId")} onValueChange={(value) => setValue("businessId", value, { shouldValidate: true })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {businesses.map((business) => (
                      <SelectItem key={business.id} value={business.id}>
                        {business.name}
                        {business.yelpBusinessId ? ` • ${business.yelpBusinessId}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/10 px-4 py-3">
                <div>
                  <div className="text-sm font-medium">Enabled</div>
                  <div className="text-xs text-muted-foreground">Use this override instead of the tenant default.</div>
                </div>
                <Switch checked={isEnabled} onCheckedChange={(checked) => setValue("isEnabled", checked)} />
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-border/70 pt-6">
            <div>
              <div className="text-sm font-semibold">Delivery</div>
              <div className="mt-1 text-xs text-muted-foreground">Choose the primary response path and fallback behavior.</div>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
              <div className="space-y-2">
                <Label>Primary channel</Label>
                <Select
                  value={watch("defaultChannel")}
                  onValueChange={(value) => setValue("defaultChannel", value as "YELP_THREAD" | "EMAIL")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YELP_THREAD">Yelp thread</SelectItem>
                    <SelectItem value="EMAIL">Yelp masked email fallback</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/10 px-4 py-3">
                <div>
                  <div className="text-sm font-medium">Masked email fallback</div>
                  <div className="text-xs text-muted-foreground">Only when thread delivery is unavailable.</div>
                </div>
                <Switch
                  checked={watch("emailFallbackEnabled")}
                  onCheckedChange={(checked) => setValue("emailFallbackEnabled", checked)}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-border/70 pt-6">
            <div>
              <div className="text-sm font-semibold">AI assist</div>
              <div className="mt-1 text-xs text-muted-foreground">Controls AI-assisted live templates and review-mode lead tools for this business.</div>
            </div>
            <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
              <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/10 px-4 py-3">
                <div>
                  <div className="text-sm font-medium">AI assist</div>
                  <div className="text-xs text-muted-foreground">{aiAssistConfigured ? "Allows AI-assisted live templates for this business." : "OpenAI key not configured."}</div>
                </div>
                <Switch
                  checked={aiAssistEnabled}
                  disabled={!aiAssistConfigured}
                  onCheckedChange={(checked) => setValue("aiAssistEnabled", checked)}
                />
              </div>
              {aiAssistConfigured && aiAssistEnabled ? (
                <div className="space-y-2">
                  <Label>AI model</Label>
                  <Select
                    value={watch("aiModel")}
                    onValueChange={(value) => setValue("aiModel", value as LeadAutoresponderBusinessOverrideValues["aiModel"])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModels.map((model) => (
                        <SelectItem key={model.value} value={model.value}>
                          {model.value} • {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">
                    {availableModels.find((model) => model.value === watch("aiModel"))?.description ?? "Approved model"}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/80 px-4 py-3 text-sm text-muted-foreground">
                  {aiAssistConfigured ? "AI assist is off for this override." : "Add `OPENAI_API_KEY` to enable AI assist."}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4 border-t border-border/70 pt-6">
            <div>
              <div className="text-sm font-semibold">Conversation automation</div>
              <div className="mt-1 text-xs text-muted-foreground">Handle new inbound Yelp thread turns after the first response, without turning the thread into an open-ended bot.</div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/10 px-4 py-3">
                <div>
                  <div className="text-sm font-medium">Enabled</div>
                  <div className="text-xs text-muted-foreground">Apply conversation handling for this Yelp business override.</div>
                </div>
                <Switch
                  checked={conversationAutomationEnabled}
                  onCheckedChange={(checked) => setValue("conversationAutomationEnabled", checked)}
                />
              </div>

              {conversationAutomationEnabled ? (
                <>
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_10rem]">
                    <div className="space-y-2">
                      <Label>Conversation mode</Label>
                      <Select
                        value={conversationMode}
                        onValueChange={(value) =>
                          setValue("conversationMode", value as LeadAutoresponderBusinessOverrideValues["conversationMode"], {
                            shouldValidate: true
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {leadConversationAutomationModeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="text-xs text-muted-foreground">
                        {leadConversationAutomationModeOptions.find((option) => option.value === conversationMode)?.description}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Max auto turns</Label>
                      <Input
                        min={1}
                        max={5}
                        type="number"
                        value={watch("conversationMaxAutomatedTurns")}
                        onChange={(event) =>
                          setValue("conversationMaxAutomatedTurns", Number(event.target.value), {
                            shouldValidate: true
                          })
                        }
                      />
                    </div>
                  </div>

                  {conversationMode === "BOUNDED_AUTO_REPLY" ? (
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-medium">Approved low-risk auto-reply intents</div>
                        <div className="text-xs text-muted-foreground">Only these intent types may auto-send. Risky categories still stop and hand off.</div>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-2">
                        {leadConversationIntentOptions.slice(0, 3).map((intent) => {
                          const checked = conversationAllowedIntents.includes(intent.value);

                          return (
                            <label
                              key={intent.value}
                              className="flex items-start gap-3 rounded-xl border border-border/70 bg-background px-3 py-3"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) => toggleConversationIntent(intent.value, value === true)}
                              />
                              <div className="min-w-0">
                                <div className="text-sm font-medium">{intent.label}</div>
                                <div className="text-xs text-muted-foreground">{intent.description}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/10 px-4 py-3">
                      <div>
                        <div className="text-sm font-medium">Review fallback</div>
                        <div className="text-xs text-muted-foreground">Use a suggested draft when bounded auto-reply stops short of sending.</div>
                      </div>
                      <Switch
                        checked={watch("conversationReviewFallbackEnabled")}
                        onCheckedChange={(checked) => setValue("conversationReviewFallbackEnabled", checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/10 px-4 py-3">
                      <div>
                        <div className="text-sm font-medium">Issue queue escalation</div>
                        <div className="text-xs text-muted-foreground">Create operator issues for blocked or risky conversation turns.</div>
                      </div>
                      <Switch
                        checked={watch("conversationEscalateToIssueQueue")}
                        onCheckedChange={(checked) => setValue("conversationEscalateToIssueQueue", checked)}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-border/80 px-4 py-3 text-sm text-muted-foreground">
                  New inbound customer thread messages stay human-only for this business.
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4 border-t border-border/70 pt-6">
            <div>
              <div className="text-sm font-semibold">Follow-ups</div>
              <div className="mt-1 text-xs text-muted-foreground">Only send later nudges when the thread still has no safe stop condition.</div>
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border border-border/80 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="text-sm font-medium">24-hour follow-up</div>
                    <div className="mt-1 text-xs text-muted-foreground">Only when the customer has not replied.</div>
                  </div>
                  <Switch checked={followUp24hEnabled} onCheckedChange={(checked) => setValue("followUp24hEnabled", checked)} />
                </div>
                {followUp24hEnabled ? (
                  <div className="mt-4 max-w-xs space-y-2">
                    <Label>Delay in hours</Label>
                    <Input
                      min={12}
                      max={48}
                      type="number"
                      value={watch("followUp24hDelayHours")}
                      onChange={(event) =>
                        setValue("followUp24hDelayHours", Number(event.target.value), {
                          shouldValidate: true
                        })
                      }
                    />
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-border/80 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="text-sm font-medium">Following-week follow-up</div>
                    <div className="mt-1 text-xs text-muted-foreground">Runs later only when the thread is still eligible.</div>
                  </div>
                  <Switch checked={followUp7dEnabled} onCheckedChange={(checked) => setValue("followUp7dEnabled", checked)} />
                </div>
                {followUp7dEnabled ? (
                  <div className="mt-4 max-w-xs space-y-2">
                    <Label>Delay in days</Label>
                    <Input
                      min={5}
                      max={10}
                      type="number"
                      value={watch("followUp7dDelayDays")}
                      onChange={(event) =>
                        setValue("followUp7dDelayDays", Number(event.target.value), {
                          shouldValidate: true
                        })
                      }
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <div className="flex gap-2">
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Saving..." : canDelete ? "Save override" : "Create override"}
            </Button>
            {canDelete ? (
              <Button disabled={isSubmitting} onClick={removeOverride} type="button" variant="outline">
                Remove override
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
