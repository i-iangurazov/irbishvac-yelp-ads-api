"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  leadAutomationScopeModeOptions,
  leadConversationAutomationModeOptions,
  leadConversationIntentOptions,
} from "@/features/autoresponder/constants";
import {
  leadAutoresponderSettingsSchema,
  type LeadAutoresponderSettingsValues,
} from "@/features/autoresponder/schemas";
import { apiFetch } from "@/lib/utils/client-api";

export function LeadAutoresponderSettingsForm({
  defaultValues,
  smtpConfigured,
  aiAssistConfigured,
  availableModels,
  businesses,
  canManageAiPlan,
}: {
  defaultValues: LeadAutoresponderSettingsValues;
  smtpConfigured: boolean;
  aiAssistConfigured: boolean;
  availableModels: ReadonlyArray<{
    value: string;
    label: string;
    description: string;
  }>;
  businesses: Array<{
    id: string;
    name: string;
    yelpBusinessId: string | null;
  }>;
  canManageAiPlan: boolean;
}) {
  const router = useRouter();
  const {
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<LeadAutoresponderSettingsValues>({
    resolver: zodResolver(leadAutoresponderSettingsSchema),
    defaultValues,
  });

  const submit = handleSubmit(async (values) => {
    try {
      await apiFetch("/api/settings/autoresponder", {
        method: "POST",
        body: JSON.stringify(values),
      });
      toast.success("Lead autoresponder settings saved.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save lead autoresponder settings.",
      );
    }
  });
  const followUp24hEnabled = watch("followUp24hEnabled");
  const followUp7dEnabled = watch("followUp7dEnabled");
  const aiAssistEnabled = watch("aiAssistEnabled");
  const scopeMode = watch("scopeMode");
  const scopedBusinessIds = watch("scopedBusinessIds");
  const conversationAutomationEnabled = watch("conversationAutomationEnabled");
  const conversationGlobalPauseEnabled = watch(
    "conversationGlobalPauseEnabled",
  );
  const conversationMode = watch("conversationMode");
  const conversationAllowedIntents = watch("conversationAllowedIntents");
  const aiAllowedModels = watch("aiAllowedModels");

  const toggleScopedBusiness = (businessId: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...(scopedBusinessIds ?? []), businessId]))
      : (scopedBusinessIds ?? []).filter(
          (candidate: string) => candidate !== businessId,
        );

    setValue("scopedBusinessIds", next, {
      shouldValidate: true,
    });
  };

  const toggleConversationIntent = (
    intent: LeadAutoresponderSettingsValues["conversationAllowedIntents"][number],
    checked: boolean,
  ) => {
    const next = checked
      ? Array.from(new Set([...(conversationAllowedIntents ?? []), intent]))
      : (conversationAllowedIntents ?? []).filter(
          (
            candidate: LeadAutoresponderSettingsValues["conversationAllowedIntents"][number],
          ) => candidate !== intent,
        );

    setValue("conversationAllowedIntents", next, {
      shouldValidate: true,
    });
  };

  const toggleAllowedModel = (
    model: LeadAutoresponderSettingsValues["aiAllowedModels"][number],
    checked: boolean,
  ) => {
    const next = checked
      ? Array.from(new Set([...(aiAllowedModels ?? []), model]))
      : (aiAllowedModels ?? []).filter((candidate) => candidate !== model);

    setValue("aiAllowedModels", next, { shouldValidate: true });
  };

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-3">
        <CardTitle>Tenant defaults</CardTitle>
        <CardDescription>
          Default automation for the businesses covered here, unless a business
          override replaces it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={submit}>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <div>
              <div className="text-sm font-semibold text-destructive">
                Tenant emergency stop
              </div>
              <div className="text-xs text-muted-foreground">
                Immediately blocks new Claude generation and all automatic
                replies for every business in this tenant.
              </div>
            </div>
            <Switch
              aria-label="Tenant emergency stop"
              checked={watch("tenantKillSwitchEnabled")}
              onCheckedChange={(checked) =>
                setValue("tenantKillSwitchEnabled", checked, {
                  shouldDirty: true,
                })
              }
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="space-y-4 rounded-lg border border-border/80 bg-muted/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Enabled</div>
                  <div className="text-xs text-muted-foreground">
                    Run the default first-response policy after intake.
                  </div>
                </div>
                <Switch
                  checked={watch("isEnabled")}
                  onCheckedChange={(checked) => setValue("isEnabled", checked)}
                />
              </div>

              <div className="space-y-2">
                <Label>Coverage</Label>
                <Select
                  value={scopeMode}
                  onValueChange={(value) =>
                    setValue(
                      "scopeMode",
                      value as LeadAutoresponderSettingsValues["scopeMode"],
                      {
                        shouldValidate: true,
                      },
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {leadAutomationScopeModeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {leadAutomationScopeModeOptions.find(
                    (option) => option.value === scopeMode,
                  )?.description ?? "Choose how tenant defaults are applied."}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Primary channel</Label>
                <Select
                  value={watch("defaultChannel")}
                  onValueChange={(value) =>
                    setValue("defaultChannel", value as "YELP_THREAD" | "EMAIL")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YELP_THREAD">Yelp thread</SelectItem>
                    <SelectItem value="EMAIL">
                      Yelp masked email fallback
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-3">
                <div>
                  <div className="text-sm font-medium">
                    Masked email fallback
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {smtpConfigured
                      ? "SMTP configured."
                      : "SMTP not configured."}
                  </div>
                </div>
                <Switch
                  checked={watch("emailFallbackEnabled")}
                  onCheckedChange={(checked) =>
                    setValue("emailFallbackEnabled", checked)
                  }
                />
              </div>
            </div>

            <div className="space-y-4 rounded-lg border border-border/80 bg-muted/10 p-4">
              <div>
                <div className="text-sm font-medium">
                  {scopeMode === "SELECTED_BUSINESSES"
                    ? "Selected businesses"
                    : "Coverage summary"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {scopeMode === "SELECTED_BUSINESSES"
                    ? "Only these businesses use the tenant default. Other businesses stay off unless they have their own override."
                    : "Every business without its own override uses the tenant default."}
                </div>
              </div>
              {scopeMode === "SELECTED_BUSINESSES" ? (
                businesses.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {businesses.map((business) => {
                      const checked = scopedBusinessIds.includes(business.id);

                      return (
                        <label
                          key={business.id}
                          className="flex items-start gap-3 rounded-lg border border-border/70 bg-background px-3 py-3"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) =>
                              toggleScopedBusiness(business.id, value === true)
                            }
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium">
                              {business.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {business.yelpBusinessId ??
                                "Yelp business ID missing"}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/80 px-4 py-3 text-sm text-muted-foreground">
                    No Yelp businesses are saved yet.
                  </div>
                )
              ) : (
                <div className="rounded-lg border border-border/70 bg-background px-4 py-3 text-sm text-muted-foreground">
                  Every business without its own override currently inherits
                  these defaults.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-border/80 bg-muted/10 p-4">
            <div>
              <div className="text-sm font-medium">Follow-ups</div>
              <div className="text-xs text-muted-foreground">
                Keep later nudges explicit and thread-safe.
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-lg border border-border/70 bg-background px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">24-hour follow-up</div>
                    <div className="text-xs text-muted-foreground">
                      Only when the customer has not replied.
                    </div>
                  </div>
                  <Switch
                    checked={followUp24hEnabled}
                    onCheckedChange={(checked) =>
                      setValue("followUp24hEnabled", checked)
                    }
                  />
                </div>
                {followUp24hEnabled ? (
                  <div className="space-y-2">
                    <Label>Delay in hours</Label>
                    <Input
                      min={12}
                      max={48}
                      type="number"
                      value={watch("followUp24hDelayHours")}
                      onChange={(event) =>
                        setValue(
                          "followUp24hDelayHours",
                          Number(event.target.value),
                          {
                            shouldValidate: true,
                          },
                        )
                      }
                    />
                  </div>
                ) : null}
              </div>

              <div className="space-y-3 rounded-lg border border-border/70 bg-background px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">
                      Following-week follow-up
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Only when the thread still has no safe stop condition.
                    </div>
                  </div>
                  <Switch
                    checked={followUp7dEnabled}
                    onCheckedChange={(checked) =>
                      setValue("followUp7dEnabled", checked)
                    }
                  />
                </div>
                {followUp7dEnabled ? (
                  <div className="space-y-2">
                    <Label>Delay in days</Label>
                    <Input
                      min={5}
                      max={10}
                      type="number"
                      value={watch("followUp7dDelayDays")}
                      onChange={(event) =>
                        setValue(
                          "followUp7dDelayDays",
                          Number(event.target.value),
                          {
                            shouldValidate: true,
                          },
                        )
                      }
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-border/80 bg-muted/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">AI assist</div>
                <div className="text-xs text-muted-foreground">
                  Allows AI-assisted live templates and review tools.
                </div>
              </div>
              <Switch
                checked={aiAssistEnabled}
                disabled={!aiAssistConfigured}
                onCheckedChange={(checked) =>
                  setValue("aiAssistEnabled", checked)
                }
              />
            </div>

            {aiAssistConfigured && aiAssistEnabled ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <Label>AI model</Label>
                  <Select
                    value={watch("aiModel")}
                    onValueChange={(value) =>
                      setValue(
                        "aiModel",
                        value as LeadAutoresponderSettingsValues["aiModel"],
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModels
                        .filter((model) =>
                          aiAllowedModels.includes(
                            model.value as LeadAutoresponderSettingsValues["aiAllowedModels"][number],
                          ),
                        )
                        .map((model) => (
                          <SelectItem key={model.value} value={model.value}>
                            {model.value} • {model.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {availableModels.find(
                      (model) => model.value === watch("aiModel"),
                    )?.description ?? "Approved model"}
                  </p>
                </div>
                {canManageAiPlan ? (
                  <>
                    <div className="space-y-2 md:col-span-2 xl:col-span-3">
                      <Label>Client tier allowlist</Label>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {availableModels.map((model) => (
                          <label
                            key={model.value}
                            className="flex items-start gap-2 rounded-lg border border-border/70 bg-background p-3"
                          >
                            <Checkbox
                              checked={aiAllowedModels.includes(
                                model.value as LeadAutoresponderSettingsValues["aiAllowedModels"][number],
                              )}
                              onCheckedChange={(checked) =>
                                toggleAllowedModel(
                                  model.value as LeadAutoresponderSettingsValues["aiAllowedModels"][number],
                                  checked === true,
                                )
                              }
                            />
                            <span className="text-xs">
                              <span className="block font-medium text-foreground">
                                {model.label}
                              </span>
                              {model.value}
                            </span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Business managers can choose only from the tiers enabled
                        here.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="aiMonthlyBudgetUsd">
                        Monthly AI budget
                      </Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          $
                        </span>
                        <Input
                          id="aiMonthlyBudgetUsd"
                          className="pl-7"
                          min={1}
                          max={10000}
                          step={1}
                          type="number"
                          value={watch("aiMonthlyBudgetUsd")}
                          onChange={(event) =>
                            setValue(
                              "aiMonthlyBudgetUsd",
                              Number(event.target.value),
                              { shouldValidate: true },
                            )
                          }
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Hard monthly tenant cap based on Claude token usage.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="aiMonthlyMessageLimit">
                        Monthly messages
                      </Label>
                      <Input
                        id="aiMonthlyMessageLimit"
                        min={1}
                        max={1000000}
                        type="number"
                        value={watch("aiMonthlyMessageLimit")}
                        onChange={(event) =>
                          setValue(
                            "aiMonthlyMessageLimit",
                            Number(event.target.value),
                            {
                              shouldValidate: true,
                            },
                          )
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Hard generation-count limit.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="aiMonthlyTokenLimit">
                        Monthly tokens
                      </Label>
                      <Input
                        id="aiMonthlyTokenLimit"
                        min={1000}
                        max={1000000000}
                        step={1000}
                        type="number"
                        value={watch("aiMonthlyTokenLimit")}
                        onChange={(event) =>
                          setValue(
                            "aiMonthlyTokenLimit",
                            Number(event.target.value),
                            {
                              shouldValidate: true,
                            },
                          )
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Includes input, output and cache tokens.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="aiUsageWarningPercent">
                        Warning threshold
                      </Label>
                      <div className="relative">
                        <Input
                          id="aiUsageWarningPercent"
                          className="pr-7"
                          min={1}
                          max={99}
                          type="number"
                          value={watch("aiUsageWarningPercent")}
                          onChange={(event) =>
                            setValue(
                              "aiUsageWarningPercent",
                              Number(event.target.value),
                              {
                                shouldValidate: true,
                              },
                            )
                          }
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          %
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Warn before any hard limit is reached.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="aiAgencyMarkupPercent">
                        Agency markup
                      </Label>
                      <div className="relative">
                        <Input
                          id="aiAgencyMarkupPercent"
                          className="pr-7"
                          min={0}
                          max={1000}
                          step={0.1}
                          type="number"
                          value={watch("aiAgencyMarkupPercent")}
                          onChange={(event) =>
                            setValue(
                              "aiAgencyMarkupPercent",
                              Number(event.target.value),
                              {
                                shouldValidate: true,
                              },
                            )
                          }
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          %
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Used only for billable usage reporting.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-background px-3 py-3 text-xs text-muted-foreground md:col-span-2 xl:col-span-3">
                      <div className="font-medium text-foreground">
                        Live AI guardrails
                      </div>
                      <div className="mt-1">
                        Rules decide eligibility. Unsafe or unavailable output
                        uses the deterministic fallback; no other AI provider is
                        called.
                      </div>
                    </div>
                    <div className="flex items-center justify-end">
                      <Button asChild type="button" variant="outline">
                        <a
                          href={`/api/usage/ai/export?month=${new Date().toISOString().slice(0, 7)}`}
                        >
                          Export monthly usage
                        </a>
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-border/70 bg-background px-3 py-3 text-xs text-muted-foreground md:col-span-2 xl:col-span-3">
                    Claude tier access, monthly limits, warning thresholds, and
                    billing markup are controlled by the platform administrator.
                    Your selected model must remain inside the approved tenant
                    allowlist.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                {aiAssistConfigured
                  ? "AI assist is off."
                  : "Add `ANTHROPIC_API_KEY` before enabling Claude assist."}
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-lg border border-border/80 bg-muted/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">
                  Conversation automation
                </div>
                <div className="text-xs text-muted-foreground">
                  Handle new inbound Yelp thread messages conservatively after
                  the first reply.
                </div>
              </div>
              <Switch
                checked={conversationAutomationEnabled}
                onCheckedChange={(checked) =>
                  setValue("conversationAutomationEnabled", checked)
                }
              />
            </div>

            {conversationAutomationEnabled ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-3">
                  <div>
                    <div className="text-sm font-medium">Quick pause</div>
                    <div className="text-xs text-muted-foreground">
                      Stop new conversation auto-handling tenant-wide without
                      deleting the saved setup.
                    </div>
                  </div>
                  <Switch
                    checked={conversationGlobalPauseEnabled}
                    onCheckedChange={(checked) =>
                      setValue("conversationGlobalPauseEnabled", checked, {
                        shouldValidate: true,
                      })
                    }
                  />
                </div>

                {conversationGlobalPauseEnabled ? (
                  <div className="rounded-lg border border-border/70 bg-background px-4 py-3 text-sm text-muted-foreground">
                    Conversation automation is paused. Existing review, mode,
                    and handoff settings stay saved and will apply again when
                    you resume automation.
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_10rem]">
                      <div className="space-y-2">
                        <Label>Conversation mode</Label>
                        <Select
                          value={conversationMode}
                          onValueChange={(value) =>
                            setValue(
                              "conversationMode",
                              value as LeadAutoresponderSettingsValues["conversationMode"],
                              {
                                shouldValidate: true,
                              },
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {leadConversationAutomationModeOptions.map(
                              (option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {
                            leadConversationAutomationModeOptions.find(
                              (option) => option.value === conversationMode,
                            )?.description
                          }
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Max auto turns</Label>
                        <Input
                          min={1}
                          max={5}
                          type="number"
                          value={watch("conversationMaxAutomatedTurns")}
                          onChange={(event) =>
                            setValue(
                              "conversationMaxAutomatedTurns",
                              Number(event.target.value),
                              {
                                shouldValidate: true,
                              },
                            )
                          }
                        />
                      </div>
                    </div>

                    {conversationMode === "BOUNDED_AUTO_REPLY" ? (
                      <div className="space-y-3">
                        <div>
                          <div className="text-sm font-medium">
                            Approved low-risk auto-reply intents
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Everything else falls back to review or human
                            handoff.
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {leadConversationIntentOptions
                            .slice(0, 3)
                            .map((intent) => {
                              const checked =
                                conversationAllowedIntents.includes(
                                  intent.value,
                                );

                              return (
                                <label
                                  key={intent.value}
                                  className="flex items-start gap-3 rounded-lg border border-border/70 bg-background px-3 py-3"
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(value) =>
                                      toggleConversationIntent(
                                        intent.value,
                                        value === true,
                                      )
                                    }
                                  />
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium">
                                      {intent.label}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {intent.description}
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                        </div>
                      </div>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-3">
                        <div>
                          <div className="text-sm font-medium">
                            Review fallback
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Use a suggested draft when bounded auto-reply cannot
                            safely act.
                          </div>
                        </div>
                        <Switch
                          checked={watch("conversationReviewFallbackEnabled")}
                          onCheckedChange={(checked) =>
                            setValue(
                              "conversationReviewFallbackEnabled",
                              checked,
                            )
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-3">
                        <div>
                          <div className="text-sm font-medium">
                            Issue queue escalation
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Open an issue when automation blocks on risky
                            inbound messages.
                          </div>
                        </div>
                        <Switch
                          checked={watch("conversationEscalateToIssueQueue")}
                          onCheckedChange={(checked) =>
                            setValue(
                              "conversationEscalateToIssueQueue",
                              checked,
                            )
                          }
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                New inbound customer thread messages will stay human-only for
                this tenant default.
              </div>
            )}
          </div>

          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? "Saving..." : "Save autoresponder settings"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
