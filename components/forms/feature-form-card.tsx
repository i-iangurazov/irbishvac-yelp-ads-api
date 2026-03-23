"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { featureCatalog, featureFormSchema, type FeatureFormValues } from "@/features/program-features/schemas";
import { apiFetch } from "@/lib/utils/client-api";

function parseList(input: string) {
  return input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseBoolean(input: unknown) {
  return String(input).toLowerCase() === "true";
}

function buildFeaturePayload(featureType: keyof typeof featureCatalog, values: FeatureFormValues, state: { keywords: string; highlights: string; itemIds: string }) {
  switch (featureType) {
    case "NEGATIVE_KEYWORD_TARGETING":
      return { type: featureType, keywords: parseList(state.keywords) };
    case "STRICT_CATEGORY_TARGETING":
      return {
        type: featureType,
        enabled: parseBoolean((values as Record<string, unknown>).enabled),
        categories: parseList(String((values as Record<string, unknown>).categories ?? ""))
      };
    case "AD_SCHEDULING":
      return {
        type: featureType,
        schedule: JSON.parse(String((values as Record<string, unknown>).schedule ?? "[]"))
      };
    case "CUSTOM_LOCATION_TARGETING":
      return {
        type: featureType,
        neighborhoods: parseList(String((values as Record<string, unknown>).neighborhoods ?? ""))
      };
    case "CALL_TRACKING":
      return { type: featureType, enabled: parseBoolean((values as Record<string, unknown>).enabled) };
    case "BUSINESS_HIGHLIGHTS":
      return { type: featureType, highlights: parseList(state.highlights) };
    case "YELP_PORTFOLIO":
      return { type: featureType, itemIds: parseList(state.itemIds) };
    default:
      return values;
  }
}

export function FeatureFormCard({
  programId,
  featureType,
  initialValue
}: {
  programId: string;
  featureType: keyof typeof featureCatalog;
  initialValue?: Record<string, unknown>;
}) {
  const router = useRouter();
  const [keywords, setKeywords] = useState(
    Array.isArray(initialValue?.keywords) ? (initialValue?.keywords as string[]).join(", ") : ""
  );
  const [highlights, setHighlights] = useState(
    Array.isArray(initialValue?.highlights) ? (initialValue?.highlights as string[]).join(", ") : ""
  );
  const [itemIds, setItemIds] = useState(
    Array.isArray(initialValue?.itemIds) ? (initialValue?.itemIds as string[]).join(", ") : ""
  );
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<Record<string, unknown>>({
    defaultValues: {
      type: featureType,
      ...(initialValue ?? {})
    }
  });

  const submit = handleSubmit(async (values) => {
    try {
      const payload = featureFormSchema.parse(buildFeaturePayload(featureType, values as FeatureFormValues, {
        keywords,
        highlights,
        itemIds
      }));

      await apiFetch(`/api/programs/${programId}/features`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });

      toast.success(`${featureCatalog[featureType].label} updated.`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update feature.");
    }
  });

  const deleteFeature = async () => {
    try {
      await apiFetch(`/api/programs/${programId}/features`, {
        method: "DELETE",
        body: JSON.stringify({ featureType })
      });
      toast.success(`${featureCatalog[featureType].label} deleted.`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete feature.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{featureCatalog[featureType].label}</CardTitle>
        <CardDescription>
          {featureCatalog[featureType].description} Example: {featureCatalog[featureType].example}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-4" onSubmit={submit}>
          <input type="hidden" value={featureType} {...register("type")} />

          {featureType === "LINK_TRACKING" ? (
            <>
              <div className="space-y-2">
                <Label>Destination URL</Label>
                <Input {...register("destinationUrl" as never)} />
              </div>
              <div className="space-y-2">
                <Label>Tracking template</Label>
                <Input {...register("trackingTemplate" as never)} />
              </div>
            </>
          ) : null}

          {featureType === "NEGATIVE_KEYWORD_TARGETING" ? (
            <div className="space-y-2">
              <Label>Blocked keywords</Label>
              <Textarea value={keywords} onChange={(event) => setKeywords(event.target.value)} />
            </div>
          ) : null}

          {featureType === "STRICT_CATEGORY_TARGETING" ? (
            <>
              <div className="space-y-2">
                <Label>Enabled</Label>
                <Input placeholder="true or false" {...register("enabled" as never)} />
              </div>
              <div className="space-y-2">
                <Label>Categories (comma separated)</Label>
                <Input {...register("categories" as never)} />
              </div>
            </>
          ) : null}

          {featureType === "AD_SCHEDULING" ? (
            <div className="space-y-2">
              <Label>Schedule JSON</Label>
              <Textarea {...register("schedule" as never)} placeholder='[{"dayOfWeek":"MON","startTime":"08:00","endTime":"18:00"}]' />
            </div>
          ) : null}

          {featureType === "CUSTOM_LOCATION_TARGETING" ? (
            <div className="space-y-2">
              <Label>Neighborhoods</Label>
              <Input {...register("neighborhoods" as never)} placeholder="SoMa, Mission, Pacific Heights" />
            </div>
          ) : null}

          {featureType === "AD_GOAL" ? (
            <div className="space-y-2">
              <Label>Goal</Label>
              <Input {...register("goal" as never)} placeholder="LEADS" />
            </div>
          ) : null}

          {featureType === "CALL_TRACKING" ? (
            <div className="space-y-2">
              <Label>Enabled</Label>
              <Input {...register("enabled" as never)} placeholder="true or false" />
            </div>
          ) : null}

          {featureType === "BUSINESS_HIGHLIGHTS" ? (
            <div className="space-y-2">
              <Label>Highlights</Label>
              <Textarea value={highlights} onChange={(event) => setHighlights(event.target.value)} />
            </div>
          ) : null}

          {featureType === "VERIFIED_LICENSE" ? (
            <>
              <div className="space-y-2">
                <Label>License number</Label>
                <Input {...register("licenseNumber" as never)} />
              </div>
              <div className="space-y-2">
                <Label>Issuing state</Label>
                <Input {...register("issuingState" as never)} />
              </div>
            </>
          ) : null}

          {featureType === "CUSTOM_RADIUS_TARGETING" ? (
            <div className="space-y-2">
              <Label>Radius miles</Label>
              <Input type="number" {...register("radiusMiles" as never, { valueAsNumber: true })} />
            </div>
          ) : null}

          {featureType === "CUSTOM_AD_TEXT" ? (
            <>
              <div className="space-y-2">
                <Label>Headline</Label>
                <Input {...register("headline" as never)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea {...register("description" as never)} />
              </div>
              <div className="space-y-2">
                <Label>Call to action</Label>
                <Input {...register("callToAction" as never)} />
              </div>
            </>
          ) : null}

          {featureType === "CUSTOM_AD_PHOTO" ? (
            <>
              <div className="space-y-2">
                <Label>Photo ID</Label>
                <Input {...register("photoId" as never)} />
              </div>
              <div className="space-y-2">
                <Label>Caption</Label>
                <Input {...register("caption" as never)} />
              </div>
            </>
          ) : null}

          {featureType === "BUSINESS_LOGO" ? (
            <div className="space-y-2">
              <Label>Logo URL</Label>
              <Input {...register("logoUrl" as never)} />
            </div>
          ) : null}

          {featureType === "YELP_PORTFOLIO" ? (
            <div className="space-y-2">
              <Label>Portfolio item IDs</Label>
              <Textarea value={itemIds} onChange={(event) => setItemIds(event.target.value)} />
            </div>
          ) : null}

          <div className="flex gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save feature"}
            </Button>
            <Button type="button" variant="outline" onClick={deleteFeature}>
              Delete feature
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
