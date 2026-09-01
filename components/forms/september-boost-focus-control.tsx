"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  septemberBoostScopes,
  type SeptemberBoostScope,
} from "@/features/ads-programs/layers";
import { apiFetch } from "@/lib/utils/client-api";

const scopeLabels: Record<SeptemberBoostScope, string> = {
  HVAC_REPAIR: "HVAC Repair",
  HVAC_INSTALLATION: "HVAC Install / Replace",
  HVAC_MAINTENANCE: "HVAC Maintenance",
  PLUMBING: "Plumbing",
  WATER_HEATER: "Water Heaters",
};

const presets: Array<{
  label: string;
  scopes: SeptemberBoostScope[];
}> = [
  { label: "All services", scopes: [...septemberBoostScopes] },
  { label: "HVAC Repair", scopes: ["HVAC_REPAIR"] },
  { label: "HVAC Install", scopes: ["HVAC_INSTALLATION"] },
  { label: "HVAC Maintenance", scopes: ["HVAC_MAINTENANCE"] },
  { label: "Plumbing + WH", scopes: ["PLUMBING", "WATER_HEATER"] },
];

function sameScopes(
  left: readonly SeptemberBoostScope[],
  right: readonly SeptemberBoostScope[],
) {
  return (
    left.length === right.length && left.every((scope) => right.includes(scope))
  );
}

export function SeptemberBoostFocusControl({
  currentScopes,
  upstreamProgramId,
}: {
  currentScopes: SeptemberBoostScope[];
  upstreamProgramId: string;
}) {
  const router = useRouter();
  const [selectedScopes, setSelectedScopes] = useState(currentScopes);
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isUnchanged = sameScopes(currentScopes, selectedScopes);

  useEffect(() => {
    setSelectedScopes(currentScopes);
  }, [currentScopes]);

  function toggleScope(scope: SeptemberBoostScope, checked: boolean) {
    setSelectedScopes((current) =>
      checked
        ? [...new Set([...current, scope])]
        : current.filter((value) => value !== scope),
    );
  }

  async function applyFocus() {
    try {
      setIsSubmitting(true);
      const result = await apiFetch<{ verified: boolean }>(
        "/api/programs/september-boost/focus",
        {
          method: "POST",
          body: JSON.stringify({ boostScopes: selectedScopes }),
        },
      );

      if (!result.verified) {
        throw new Error("Yelp did not verify the Boost focus change.");
      }

      setOpen(false);
      toast.success("Boost focus updated and verified by Yelp.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update the Boost focus.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              End-of-Month Boost focus
            </CardTitle>
            <CardDescription>
              $5,000 scheduled for Sep 25-30 · Yelp ID {upstreamProgramId}
            </CardDescription>
          </div>
          <Badge variant="outline">{selectedScopes.length} active</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2" aria-label="Focus presets">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant={
                sameScopes(selectedScopes, preset.scopes)
                  ? "secondary"
                  : "outline"
              }
              onClick={() => setSelectedScopes(preset.scopes)}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {septemberBoostScopes.map((scope) => (
            <Label
              key={scope}
              className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <span className="text-sm font-medium">{scopeLabels[scope]}</span>
              <Switch
                checked={selectedScopes.includes(scope)}
                onCheckedChange={(checked) => toggleScope(scope, checked)}
                aria-label={scopeLabels[scope]}
              />
            </Label>
          ))}
        </div>

        {selectedScopes.length === 0 ? (
          <div className="rounded-lg border border-warning/35 bg-warning/10 p-3 text-sm text-warning">
            At least one direction must remain active.
          </div>
        ) : null}

        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              disabled={selectedScopes.length === 0 || isUnchanged}
            >
              Apply focus
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apply Boost focus to Yelp?</AlertDialogTitle>
              <AlertDialogDescription>
                Active directions:{" "}
                {selectedScopes.map((scope) => scopeLabels[scope]).join(", ")}.
                The change is accepted only after Yelp category and keyword
                read-back succeeds.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogDismiss disabled={isSubmitting}>
                Cancel
              </AlertDialogDismiss>
              <Button
                type="button"
                disabled={isSubmitting}
                onClick={() => void applyFocus()}
              >
                {isSubmitting ? "Applying..." : "Confirm and apply"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
