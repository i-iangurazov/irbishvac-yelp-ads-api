"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { manualBusinessFormSchema } from "@/features/businesses/schemas";
import { apiFetch } from "@/lib/utils/client-api";
import { parseManualCategoryText } from "@/lib/yelp/categories";

type ManualBusinessFormValues = z.infer<typeof manualBusinessFormSchema>;

function cleanOptional(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

export function ManualBusinessForm() {
  const router = useRouter();
  const {
    register,
    watch,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<ManualBusinessFormValues>({
    resolver: zodResolver(manualBusinessFormSchema),
    defaultValues: {
      name: "",
      encrypted_business_id: "",
      city: "",
      state: "",
      country: "US",
      categoriesText: "",
      hasAboutText: false
    }
  });

  const categories = parseManualCategoryText(watch("categoriesText") ?? "");
  const categoryAliases = categories.map((category) => category.alias).filter((value): value is string => Boolean(value));
  const hasAboutText = watch("hasAboutText");
  const missingItems = [
    ...(hasAboutText ? [] : ["Add specialties/about-this-business text"]),
    ...(categories.length > 0 ? [] : ["Add at least one category"])
  ];

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = await apiFetch<{ id: string }>("/api/businesses", {
        method: "POST",
        body: JSON.stringify({
          source: "manual",
          encrypted_business_id: values.encrypted_business_id.trim(),
          name: values.name.trim(),
          city: cleanOptional(values.city),
          state: cleanOptional(values.state),
          country: cleanOptional(values.country),
          categories,
          readiness: {
            hasAboutText: values.hasAboutText,
            hasCategories: categories.length > 0,
            missingItems
          }
        })
      });

      toast.success("Business saved.");
      router.push(`/businesses/${saved.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save business.");
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual business entry</CardTitle>
        <CardDescription>
          Use this when Yelp already gave you the encrypted Yelp business ID or Business Match is not enabled yet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 lg:grid-cols-2" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="manual-name">Business name</Label>
            <Input id="manual-name" placeholder="Northwind HVAC" {...register("name")} />
            {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-encrypted-business-id">Encrypted Yelp business ID</Label>
            <Input id="manual-encrypted-business-id" placeholder="enc_business_123" {...register("encrypted_business_id")} />
            {errors.encrypted_business_id ? <p className="text-sm text-destructive">{errors.encrypted_business_id.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-city">City</Label>
            <Input id="manual-city" placeholder="San Francisco" {...register("city")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-state">State / region</Label>
            <Input id="manual-state" placeholder="CA" {...register("state")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-country">Country</Label>
            <Input id="manual-country" placeholder="US" {...register("country")} />
          </div>

          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="manual-categories">Categories</Label>
            <Textarea
              id="manual-categories"
              placeholder={`Plumbing | plumbing\nMovers | movers\nGeneral Contractors | contractors`}
              {...register("categoriesText")}
            />
            <p className="text-xs text-muted-foreground">
              Enter one category per line. Use <span className="font-mono">Label | yelp_alias</span> when you know the Yelp alias. Alias-backed categories are required for CPC ad submission.
            </p>
          </div>

          <Label className="flex items-center justify-between rounded-lg border border-border p-4 lg:col-span-2">
            <div>
              <div className="font-medium">About-this-business text already exists</div>
              <div className="text-sm text-muted-foreground">
                Turn this on only if the Yelp listing already has specialties or about-this-business text in place.
              </div>
            </div>
            <Switch checked={hasAboutText} onCheckedChange={(checked) => setValue("hasAboutText", checked)} />
          </Label>

          <div className="rounded-xl border border-border bg-muted/40 p-4 lg:col-span-2">
            <div className="font-medium">CPC readiness preview</div>
            <div className="mt-2 text-sm text-muted-foreground">
              {missingItems.length === 0 ? "Ready for CPC." : missingItems.join("; ")}
            </div>
            <div className="mt-3 text-sm text-muted-foreground">
              {categories.length === 0
                ? "No categories entered yet."
                : categoryAliases.length === categories.length
                  ? `Category aliases ready: ${categoryAliases.join(", ")}`
                  : "Some saved categories still have labels only. CPC creation will require Yelp aliases for every selected category."}
            </div>
          </div>

          <div className="lg:col-span-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save business"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
