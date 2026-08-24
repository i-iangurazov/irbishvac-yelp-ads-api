"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogDismiss,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  campaignLayerLabels,
  normalizeCampaignLayer,
} from "@/features/ads-programs/layers";
import { apiFetch } from "@/lib/utils/client-api";
import { normalizeYelpCategories } from "@/lib/yelp/categories";

function normalizedAliases(value: unknown) {
  return normalizeYelpCategories(value)
    .map((category) => category.alias)
    .filter((alias): alias is string => Boolean(alias))
    .sort();
}

function arraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function ProgramCategoryTargetingOperations({
  programId,
  currentCategories,
  listingCategories,
  currentCampaignLayer,
}: {
  programId: string;
  currentCategories: unknown;
  listingCategories: unknown;
  currentCampaignLayer: unknown;
}) {
  const router = useRouter();
  const catalog = useMemo(
    () =>
      normalizeYelpCategories(listingCategories).filter(
        (category) => category.alias,
      ),
    [listingCategories],
  );
  const currentAliases = useMemo(
    () => normalizedAliases(currentCategories),
    [currentCategories],
  );
  const [selectedAliases, setSelectedAliases] = useState(currentAliases);
  const campaignLayer = normalizeCampaignLayer(currentCampaignLayer);
  const [internalNote, setInternalNote] = useState("");
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sortedSelectedAliases = [...selectedAliases].sort();
  const listingAliases = catalog.map((category) => category.alias!).sort();
  const isListingWide =
    listingAliases.length > 0 &&
    listingAliases.every((alias) => sortedSelectedAliases.includes(alias));
  const isUnchanged = arraysEqual(currentAliases, sortedSelectedAliases);

  useEffect(() => {
    setSelectedAliases(currentAliases);
  }, [currentAliases]);

  function toggleAlias(alias: string, checked: boolean) {
    setSelectedAliases((current) =>
      checked
        ? [...new Set([...current, alias])]
        : current.filter((value) => value !== alias),
    );
  }

  async function submit() {
    setIsSubmitting(true);

    try {
      const result = await apiFetch<{ programId: string; jobId: string }>(
        `/api/programs/${programId}/categories`,
        {
          method: "POST",
          body: JSON.stringify({
            adCategories: sortedSelectedAliases,
            campaignLayer,
            internalNote,
          }),
        },
      );
      setOpen(false);
      toast.success("Category targeting change submitted to Yelp.");
      router.push(`/programs/${result.programId}?jobId=${result.jobId}`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update category targeting.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card id="category-targeting">
      <CardHeader>
        <CardTitle>Category targeting</CardTitle>
        <CardDescription>
          Sends only Yelp&apos;s{" "}
          <span className="font-mono">ad_categories</span> field. Budget, start
          date, bidding, and pacing are not included in this operation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {catalog.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={isListingWide ? "success" : "warning"}>
                  {isListingWide ? "Listing-wide" : "Category-specific"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {selectedAliases.length} of {catalog.length} listing
                  categories selected
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedAliases(listingAliases)}
              >
                Select all listing categories
              </Button>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {catalog.map((category) => (
                <Label
                  key={category.alias}
                  className="flex items-start gap-3 rounded-lg border border-border p-3"
                >
                  <Checkbox
                    checked={selectedAliases.includes(category.alias!)}
                    onCheckedChange={(checked) =>
                      toggleAlias(category.alias!, checked === true)
                    }
                  />
                  <span>
                    <span className="block font-medium">{category.label}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {category.alias}
                    </span>
                  </span>
                </Label>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Campaign layer</Label>
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                {campaignLayerLabels[campaignLayer]}
              </div>
              <p className="text-xs text-muted-foreground">
                Campaign layers are fixed after creation. This operation changes
                Yelp category aliases only.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="categoryTargetingInternalNote">
                Internal audit note
              </Label>
              <Textarea
                id="categoryTargetingInternalNote"
                value={internalNote}
                onChange={(event) => setInternalNote(event.target.value)}
                placeholder="Why this targeting change is being made"
              />
            </div>

            {selectedAliases.length === 0 ? (
              <div className="rounded-lg border border-warning/35 bg-warning/10 p-3 text-sm text-warning">
                Select at least one explicit category. Empty targeting is not
                used for edits because omitting the field would leave Yelp
                unchanged.
              </div>
            ) : null}

            <AlertDialog open={open} onOpenChange={setOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  disabled={selectedAliases.length === 0 || isUnchanged}
                >
                  Review targeting change
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Change live Yelp category targeting?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This changes where the live CPC campaign can serve. The
                    operation sends only these aliases:{" "}
                    <span className="font-mono">
                      {sortedSelectedAliases.join(", ")}
                    </span>
                    . Internal campaign layer:{" "}
                    {campaignLayerLabels[campaignLayer]}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogDismiss type="button">Cancel</AlertDialogDismiss>
                  <Button
                    type="button"
                    disabled={isSubmitting}
                    onClick={submit}
                  >
                    {isSubmitting ? "Submitting..." : "Submit to Yelp"}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <div className="rounded-lg border border-warning/35 bg-warning/10 p-4 text-sm text-warning">
            No Yelp category aliases are saved for this business. Sync or
            correct the listing before changing campaign targeting.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
