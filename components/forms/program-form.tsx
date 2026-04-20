"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createProgramFormSchema,
  editProgramFormSchema,
  programTypeLabels,
  type CreateProgramFormValues,
  type EditProgramFormValues
} from "@/features/ads-programs/schemas";
import { apiFetch } from "@/lib/utils/client-api";
import { formatInteger, parseCurrencyToCents } from "@/lib/utils/format";
import type { YelpCategoryOption } from "@/lib/yelp/categories";

type BusinessOption = {
  id: string;
  name: string;
  categories: YelpCategoryOption[];
  readiness: {
    isReadyForCpc: boolean;
    missingItems: string[];
    adsEligibilityStatus: "UNKNOWN" | "ELIGIBLE" | "BLOCKED";
    adsEligibilityMessage?: string;
  };
};

type ProgramFormProps =
  | {
      mode: "create";
      businesses: BusinessOption[];
      initialValues?: Partial<CreateProgramFormValues>;
    }
  | {
      mode: "edit";
      businesses: BusinessOption[];
      programId: string;
      initialValues: Partial<EditProgramFormValues>;
    };

function normalizePacingMethod(value?: string) {
  if (value === "STANDARD") {
    return "paced" as const;
  }

  if (value === "ACCELERATED") {
    return "unpaced" as const;
  }

  return value === "unpaced" ? "unpaced" : "paced";
}

function normalizeFeePeriod(value?: string) {
  if (value === "MONTHLY") {
    return "CALENDAR_MONTH" as const;
  }

  if (value === "WEEKLY") {
    return "ROLLING_MONTH" as const;
  }

  return value === "ROLLING_MONTH" ? "ROLLING_MONTH" : "CALENDAR_MONTH";
}

const eligibilityVariantMap = {
  UNKNOWN: "outline",
  ELIGIBLE: "success",
  BLOCKED: "destructive"
} as const;

const eligibilityLabelMap = {
  UNKNOWN: "Unknown",
  ELIGIBLE: "Eligible",
  BLOCKED: "Blocked by Yelp policy"
} as const;

export function ProgramForm(props: ProgramFormProps) {
  const router = useRouter();

  const defaultValues = {
    businessId: props.initialValues?.businessId ?? props.businesses[0]?.id ?? "",
    programType: props.initialValues?.programType ?? "CPC",
    currency: props.initialValues?.currency ?? "USD",
    startDate: props.initialValues?.startDate ?? "",
    monthlyBudgetDollars: props.initialValues?.monthlyBudgetDollars ?? "",
    isAutobid: props.initialValues?.isAutobid ?? true,
    maxBidDollars: props.initialValues?.maxBidDollars ?? "",
    pacingMethod: normalizePacingMethod(props.initialValues?.pacingMethod),
    feePeriod: normalizeFeePeriod(props.initialValues?.feePeriod),
    adCategories: props.initialValues?.adCategories ?? [],
    scheduledBudgetEffectiveDate: props.initialValues?.scheduledBudgetEffectiveDate ?? "",
    scheduledBudgetDollars: props.initialValues?.scheduledBudgetDollars ?? "",
    notes: props.initialValues?.notes ?? ""
  } satisfies CreateProgramFormValues;

  const schema = props.mode === "create" ? createProgramFormSchema : editProgramFormSchema;
  const {
    register,
    setValue,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<CreateProgramFormValues | EditProgramFormValues>({
    resolver: zodResolver(schema),
    defaultValues: props.mode === "edit" ? { ...defaultValues, programId: props.programId } : defaultValues
  });

  const selectedBusiness = props.businesses.find((business) => business.id === watch("businessId"));
  const programType = watch("programType");
  const isAutobid = watch("isAutobid");
  const watchedCategoryAliases = watch("adCategories");
  const selectedCategoryAliases = useMemo(() => watchedCategoryAliases ?? [], [watchedCategoryAliases]);

  const aliasBackedCategories = useMemo(
    () => (selectedBusiness?.categories ?? []).filter((category) => typeof category.alias === "string" && category.alias.length > 0),
    [selectedBusiness]
  );
  const legacySelectedCategories = useMemo(
    () =>
      selectedCategoryAliases.filter(
        (alias) => !aliasBackedCategories.some((category) => category.alias === alias)
      ),
    [aliasBackedCategories, selectedCategoryAliases]
  );

  useEffect(() => {
    if (programType !== "CPC") {
      return;
    }

    const validAliases = selectedCategoryAliases.filter((alias) =>
      aliasBackedCategories.some((category) => category.alias === alias)
    );

    if (validAliases.length !== selectedCategoryAliases.length) {
      setValue("adCategories", validAliases, {
        shouldValidate: true,
        shouldDirty: true
      });
    }
  }, [aliasBackedCategories, programType, selectedCategoryAliases, setValue]);

  const centsPreview = useMemo(() => {
    try {
      return watch("monthlyBudgetDollars") ? parseCurrencyToCents(watch("monthlyBudgetDollars")!) : 0;
    } catch {
      return 0;
    }
  }, [watch]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result =
        props.mode === "create"
          ? await apiFetch<{ programId: string; jobId: string }>("/api/programs", {
              method: "POST",
              body: JSON.stringify(values)
            })
          : await apiFetch<{ programId: string; jobId: string }>(`/api/programs/${props.programId}`, {
              method: "PATCH",
              body: JSON.stringify(values)
            });

      toast.success(props.mode === "create" ? "Program submitted to Yelp." : "Program update submitted to Yelp.");
      router.push(`/programs/${result.programId}?jobId=${result.jobId}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit program.");
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.mode === "create" ? "Create program" : "Edit program"}</CardTitle>
        <CardDescription>
          Use dollar inputs. The console saves the request immediately, then waits for Yelp to confirm the final state.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5 lg:grid-cols-2" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label>Business</Label>
            <Select
              defaultValue={watch("businessId")}
              onValueChange={(value) => {
                setValue("businessId", value);
                setValue("adCategories", [], {
                  shouldValidate: true,
                  shouldDirty: true
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a business" />
              </SelectTrigger>
              <SelectContent>
                {props.businesses.map((business) => (
                  <SelectItem key={business.id} value={business.id}>
                    {business.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBusiness?.readiness.isReadyForCpc === false && programType === "CPC" ? (
              <p className="text-sm text-warning">
                CPC readiness issues: {selectedBusiness.readiness.missingItems.join("; ")}
              </p>
            ) : null}
            {selectedBusiness && programType === "CPC" ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Ad eligibility</span>
                  <Badge variant={eligibilityVariantMap[selectedBusiness.readiness.adsEligibilityStatus]}>
                    {eligibilityLabelMap[selectedBusiness.readiness.adsEligibilityStatus]}
                  </Badge>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {selectedBusiness.readiness.adsEligibilityMessage ??
                    (selectedBusiness.readiness.adsEligibilityStatus === "UNKNOWN"
                      ? "Yelp has not confirmed ad eligibility yet."
                      : "This business has already completed a Yelp ads operation successfully.")}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Program type</Label>
            <Select
              defaultValue={watch("programType")}
              onValueChange={(value: string) => setValue("programType", value as CreateProgramFormValues["programType"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(programTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" type="date" {...register("startDate")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Input id="currency" {...register("currency")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="monthlyBudgetDollars">Monthly budget (dollars)</Label>
            <Input id="monthlyBudgetDollars" placeholder="500.00" {...register("monthlyBudgetDollars")} />
            <p className="text-xs text-muted-foreground">Exact payload preview: {formatInteger(centsPreview)} cents</p>
            {errors.monthlyBudgetDollars ? <p className="text-sm text-destructive">{errors.monthlyBudgetDollars.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="adCategories">Ad categories</Label>
            {selectedBusiness ? (
              aliasBackedCategories.length > 0 ? (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Leave all unchecked to omit <span className="font-mono">ad_categories</span> and let Yelp use the listing categories.
                    Use checked aliases for a more specific category CPC program alongside the main listing-wide program.
                  </div>
                  {aliasBackedCategories.map((category) => (
                    <Label key={category.alias} className="flex items-start gap-3 rounded-md border border-transparent p-2 hover:bg-muted/40">
                      <Checkbox
                        checked={selectedCategoryAliases.includes(category.alias!)}
                        onCheckedChange={(checked) => {
                          const next = checked
                            ? [...new Set([...selectedCategoryAliases, category.alias!])]
                            : selectedCategoryAliases.filter((value) => value !== category.alias);

                          setValue("adCategories", next, {
                            shouldValidate: true,
                            shouldDirty: true
                          });
                        }}
                      />
                      <div>
                        <div className="font-medium">{category.label}</div>
                        <div className="text-xs text-muted-foreground">Yelp alias: {category.alias}</div>
                      </div>
                    </Label>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  No Yelp category aliases are saved for this business yet. You can still submit CPC without explicit <span className="font-mono">ad_categories</span>.
                </div>
              )
            ) : (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                Select a business first to load available Yelp category aliases.
              </div>
            )}
            {legacySelectedCategories.length > 0 ? (
              <p className="text-xs text-warning">
                Previously saved category values are not valid Yelp aliases and will be ignored.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Checked aliases are sent as Yelp <span className="font-mono">ad_categories</span>. Leave them unchecked to omit the field.
            </p>
            {errors.adCategories ? <p className="text-sm text-destructive">{errors.adCategories.message as string}</p> : null}
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Checkbox
                checked={isAutobid}
                onCheckedChange={(checked) => setValue("isAutobid", checked === true)}
              />
              Use Yelp autobid
            </Label>
            <p className="text-xs text-muted-foreground">If autobid is off, max bid is required.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxBidDollars">Max bid (dollars)</Label>
            <Input id="maxBidDollars" placeholder="22.00" disabled={isAutobid} {...register("maxBidDollars")} />
            {errors.maxBidDollars ? <p className="text-sm text-destructive">{errors.maxBidDollars.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label>Pacing method</Label>
            <Select defaultValue={watch("pacingMethod")} onValueChange={(value) => setValue("pacingMethod", value as "paced" | "unpaced")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paced">Paced</SelectItem>
                <SelectItem value="unpaced">Unpaced</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {props.mode === "create" ? (
            <div className="space-y-2">
              <Label>Fee period</Label>
              <Select
                defaultValue={watch("feePeriod")}
                onValueChange={(value) => setValue("feePeriod", value as "CALENDAR_MONTH" | "ROLLING_MONTH")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CALENDAR_MONTH">Calendar month</SelectItem>
                  <SelectItem value="ROLLING_MONTH">Rolling month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="scheduledBudgetEffectiveDate">Future budget change date</Label>
            <Input id="scheduledBudgetEffectiveDate" type="date" disabled={props.mode === "create"} {...register("scheduledBudgetEffectiveDate")} />
            {props.mode === "create" ? (
              <p className="text-xs text-muted-foreground">Future budget changes are documented on program edit after the program already exists.</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="scheduledBudgetDollars">Future budget (dollars)</Label>
            <Input id="scheduledBudgetDollars" placeholder="650.00" disabled={props.mode === "create"} {...register("scheduledBudgetDollars")} />
          </div>

          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="notes">Operator notes</Label>
            <Textarea id="notes" placeholder="Explain why this request is being submitted." {...register("notes")} />
          </div>

          <div className="rounded-xl border border-border bg-muted/40 p-4 lg:col-span-2">
            <div className="font-medium">Payload preview</div>
            <div className="mt-2 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
              <div>Program type: {programTypeLabels[programType as keyof typeof programTypeLabels]}</div>
              <div>Business: {selectedBusiness?.name ?? "Select a business"}</div>
              <div>Budget payload: {formatInteger(centsPreview)} cents</div>
              <div>
                Ad categories payload:{" "}
                {selectedCategoryAliases.length > 0 ? selectedCategoryAliases.join(", ") : "Omit field and let Yelp use listing categories"}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                !selectedBusiness ||
                (programType === "CPC" && selectedBusiness.readiness.isReadyForCpc === false)
              }
            >
              {isSubmitting ? "Submitting..." : props.mode === "create" ? "Submit program" : "Submit update"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
