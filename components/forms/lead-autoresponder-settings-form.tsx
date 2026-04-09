"use client";

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
import { leadAutomationScopeModeOptions } from "@/features/autoresponder/constants";
import {
  leadAutoresponderSettingsSchema,
  type LeadAutoresponderSettingsValues
} from "@/features/autoresponder/schemas";
import { apiFetch } from "@/lib/utils/client-api";

export function LeadAutoresponderSettingsForm({
  defaultValues,
  smtpConfigured,
  aiAssistConfigured,
  availableModels,
  businesses
}: {
  defaultValues: LeadAutoresponderSettingsValues;
  smtpConfigured: boolean;
  aiAssistConfigured: boolean;
  availableModels: ReadonlyArray<{ value: string; label: string; description: string }>;
  businesses: Array<{ id: string; name: string; yelpBusinessId: string | null }>;
}) {
  const router = useRouter();
  const {
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting }
  } = useForm<LeadAutoresponderSettingsValues>({
    resolver: zodResolver(leadAutoresponderSettingsSchema),
    defaultValues
  });

  const submit = handleSubmit(async (values) => {
    try {
      await apiFetch("/api/settings/autoresponder", {
        method: "POST",
        body: JSON.stringify(values)
      });
      toast.success("Lead autoresponder settings saved.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save lead autoresponder settings.");
    }
  });
  const followUp24hEnabled = watch("followUp24hEnabled");
  const followUp7dEnabled = watch("followUp7dEnabled");
  const aiAssistEnabled = watch("aiAssistEnabled");
  const scopeMode = watch("scopeMode");
  const scopedBusinessIds = watch("scopedBusinessIds");

  const toggleScopedBusiness = (businessId: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...(scopedBusinessIds ?? []), businessId]))
      : (scopedBusinessIds ?? []).filter((candidate) => candidate !== businessId);

    setValue("scopedBusinessIds", next, {
      shouldValidate: true
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Tenant defaults</CardTitle>
        <CardDescription>Default automation for the businesses you choose here, unless a business override replaces it.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="space-y-4 rounded-xl border border-border/80 bg-muted/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Enabled</div>
                  <div className="text-xs text-muted-foreground">Run the default first-response policy after intake.</div>
                </div>
                <Switch checked={watch("isEnabled")} onCheckedChange={(checked) => setValue("isEnabled", checked)} />
              </div>

              <div className="space-y-2">
                <Label>Coverage</Label>
                <Select
                  value={scopeMode}
                  onValueChange={(value) =>
                    setValue("scopeMode", value as LeadAutoresponderSettingsValues["scopeMode"], {
                      shouldValidate: true
                    })
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
                  {leadAutomationScopeModeOptions.find((option) => option.value === scopeMode)?.description ??
                    "Choose how tenant defaults are applied."}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Primary channel</Label>
                <Select value={watch("defaultChannel")} onValueChange={(value) => setValue("defaultChannel", value as "YELP_THREAD" | "EMAIL")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YELP_THREAD">Yelp thread</SelectItem>
                    <SelectItem value="EMAIL">Yelp masked email fallback</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background px-3 py-3">
                <div>
                  <div className="text-sm font-medium">Masked email fallback</div>
                  <div className="text-xs text-muted-foreground">
                    {smtpConfigured ? "SMTP configured." : "SMTP not configured."}
                  </div>
                </div>
                <Switch
                  checked={watch("emailFallbackEnabled")}
                  onCheckedChange={(checked) => setValue("emailFallbackEnabled", checked)}
                />
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-border/80 bg-muted/10 p-4">
              <div>
                <div className="text-sm font-medium">
                  {scopeMode === "SELECTED_BUSINESSES" ? "Selected businesses" : "Coverage summary"}
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
                          className="flex items-start gap-3 rounded-xl border border-border/70 bg-background px-3 py-3"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => toggleScopedBusiness(business.id, value === true)}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{business.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {business.yelpBusinessId ?? "Yelp business ID missing"}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/80 px-4 py-3 text-sm text-muted-foreground">
                    No Yelp businesses are saved yet.
                  </div>
                )
              ) : (
                <div className="rounded-xl border border-border/70 bg-background px-4 py-3 text-sm text-muted-foreground">
                  Every business without its own override currently inherits these defaults.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-border/80 bg-muted/10 p-4">
            <div>
              <div className="text-sm font-medium">Follow-ups</div>
              <div className="text-xs text-muted-foreground">Keep later nudges explicit and thread-safe.</div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-border/70 bg-background px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">24-hour follow-up</div>
                    <div className="text-xs text-muted-foreground">Only when the customer has not replied.</div>
                  </div>
                  <Switch checked={followUp24hEnabled} onCheckedChange={(checked) => setValue("followUp24hEnabled", checked)} />
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
                        setValue("followUp24hDelayHours", Number(event.target.value), {
                          shouldValidate: true
                        })
                      }
                    />
                  </div>
                ) : null}
              </div>

              <div className="space-y-3 rounded-xl border border-border/70 bg-background px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Following-week follow-up</div>
                    <div className="text-xs text-muted-foreground">Only when the thread still has no safe stop condition.</div>
                  </div>
                  <Switch checked={followUp7dEnabled} onCheckedChange={(checked) => setValue("followUp7dEnabled", checked)} />
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
                        setValue("followUp7dDelayDays", Number(event.target.value), {
                          shouldValidate: true
                        })
                      }
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-border/80 bg-muted/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">AI assist</div>
                <div className="text-xs text-muted-foreground">Allows AI-assisted live templates and review-mode lead tools.</div>
              </div>
              <Switch
                checked={aiAssistEnabled}
                disabled={!aiAssistConfigured}
                onCheckedChange={(checked) => setValue("aiAssistEnabled", checked)}
              />
            </div>

            {aiAssistConfigured && aiAssistEnabled ? (
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
                <div className="space-y-2">
                  <Label>AI model</Label>
                  <Select
                    value={watch("aiModel")}
                    onValueChange={(value) => setValue("aiModel", value as LeadAutoresponderSettingsValues["aiModel"])}
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
                  <p className="text-xs text-muted-foreground">
                    {availableModels.find((model) => model.value === watch("aiModel"))?.description ?? "Approved model"}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background px-3 py-3 text-xs text-muted-foreground">
                  <div className="font-medium text-foreground">Live AI guardrails</div>
                  <div className="mt-1">Rules still decide eligibility. Static fallback still exists if AI output is unsafe or unavailable.</div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                {aiAssistConfigured ? "AI assist is off." : "Add `OPENAI_API_KEY` before enabling AI assist."}
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
