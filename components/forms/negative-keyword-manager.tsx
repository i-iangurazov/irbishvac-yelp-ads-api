"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogConfirm,
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
  MAX_BLOCKED_KEYWORDS,
  normalizeBlockedKeywords,
} from "@/features/program-features/keywords";
import { apiFetch } from "@/lib/utils/client-api";

type KeywordSource = "YELP_LIVE" | "LOCAL_SNAPSHOT" | "DEMO_SNAPSHOT";
type KeywordWriteMode = "LIVE" | "DEMO" | "READ_ONLY";

type KeywordState = {
  suggestedKeywords: string[];
  blockedKeywords: string[];
};

function keywordKey(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function splitBlockedKeywords(
  blockedKeywords: string[],
  suggestedKeywords: string[],
) {
  const suggestedKeys = new Set(suggestedKeywords.map(keywordKey));

  return {
    selectedSuggested: blockedKeywords.filter((keyword) =>
      suggestedKeys.has(keywordKey(keyword)),
    ),
    customKeywords: blockedKeywords.filter(
      (keyword) => !suggestedKeys.has(keywordKey(keyword)),
    ),
  };
}

function parseCustomKeywords(value: string) {
  return normalizeBlockedKeywords(value.split(/[\n,]/));
}

export function NegativeKeywordManager({
  programId,
  supported,
  suggestedKeywords,
  blockedKeywords,
  source,
  syncedAt,
  message,
  writeMode,
}: {
  programId: string;
  supported: boolean;
  suggestedKeywords: string[];
  blockedKeywords: string[];
  source: KeywordSource;
  syncedAt: string | null;
  message: string;
  writeMode: KeywordWriteMode;
}) {
  const router = useRouter();
  const initial = useMemo(
    () => splitBlockedKeywords(blockedKeywords, suggestedKeywords),
    [blockedKeywords, suggestedKeywords],
  );
  const [selectedSuggested, setSelectedSuggested] = useState(
    initial.selectedSuggested,
  );
  const [customKeywords, setCustomKeywords] = useState(
    initial.customKeywords.join("\n"),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const allBlockedKeywords = normalizeBlockedKeywords([
    ...selectedSuggested,
    ...parseCustomKeywords(customKeywords),
  ]);
  const isLive = source === "YELP_LIVE";
  const canManage = writeMode !== "READ_ONLY";

  function applyState(next: KeywordState) {
    const split = splitBlockedKeywords(
      next.blockedKeywords,
      next.suggestedKeywords,
    );
    setSelectedSuggested(split.selectedSuggested);
    setCustomKeywords(split.customKeywords.join("\n"));
  }

  function toggleSuggested(keyword: string, checked: boolean) {
    setSelectedSuggested((current) =>
      checked
        ? normalizeBlockedKeywords([...current, keyword])
        : current.filter((item) => keywordKey(item) !== keywordKey(keyword)),
    );
  }

  async function save() {
    try {
      setIsSaving(true);
      const result = await apiFetch<{ negativeKeywords: KeywordState }>(
        `/api/programs/${programId}/features`,
        {
          method: "PUT",
          body: JSON.stringify({
            type: "NEGATIVE_KEYWORD_TARGETING",
            blockedKeywords: allBlockedKeywords,
          }),
        },
      );

      applyState(result.negativeKeywords);
      toast.success(
        writeMode === "LIVE"
          ? `Verified ${result.negativeKeywords.blockedKeywords.length} blocked keywords on Yelp.`
          : "Demo keyword snapshot updated.",
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update blocked keywords.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function clearAll() {
    try {
      setIsClearing(true);
      const result = await apiFetch<{ negativeKeywords: KeywordState }>(
        `/api/programs/${programId}/features`,
        {
          method: "DELETE",
          body: JSON.stringify({ featureType: "NEGATIVE_KEYWORD_TARGETING" }),
        },
      );

      applyState(result.negativeKeywords);
      toast.success(
        writeMode === "LIVE"
          ? "Yelp confirmed that all blocked keywords were cleared."
          : "Demo keywords cleared.",
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to clear blocked keywords.",
      );
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <Card className="mt-6 overflow-hidden">
      <CardHeader className="border-b bg-muted/30">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" aria-hidden="true" />
              Yelp search-term exclusions
            </CardTitle>
            <CardDescription className="max-w-3xl">
              Review Yelp-suggested search terms and block terms that should not
              make this campaign eligible to serve. Yelp suggestions are
              guidance, not an exhaustive positive-keyword list.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                isLive
                  ? "success"
                  : source === "DEMO_SNAPSHOT"
                    ? "warning"
                    : "secondary"
              }
            >
              {isLive
                ? "Live Yelp data"
                : source === "DEMO_SNAPSHOT"
                  ? "Demo data"
                  : "Saved snapshot"}
            </Badge>
            <Badge variant="outline">{allBlockedKeywords.length} blocked</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <div className="flex items-start gap-3 rounded-lg border bg-background p-4 text-sm">
          {isLive ? (
            <CheckCircle2
              className="mt-0.5 h-5 w-5 shrink-0 text-success"
              aria-hidden="true"
            />
          ) : (
            <ShieldAlert
              className="mt-0.5 h-5 w-5 shrink-0 text-warning"
              aria-hidden="true"
            />
          )}
          <div>
            <div className="font-medium">{message}</div>
            <div className="mt-1 text-muted-foreground">
              {syncedAt
                ? `Last loaded ${new Date(syncedAt).toLocaleString()}. `
                : ""}
              {writeMode === "LIVE"
                ? "Live saves are accepted only after Yelp returns the exact blocked set on read-back."
                : writeMode === "DEMO"
                  ? "Demo changes remain local and are never represented as Yelp writes."
                  : "This saved state is read-only until Program Feature API access is enabled."}
            </div>
          </div>
        </div>

        {!supported ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <div className="font-medium">
              Negative Keyword Targeting is unavailable for this program.
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              The feature must be enabled for the Yelp partner account and
              returned as available for this specific program.
            </p>
          </div>
        ) : (
          <>
            <section
              className="space-y-3"
              aria-labelledby="suggested-keywords-title"
            >
              <div>
                <h2
                  id="suggested-keywords-title"
                  className="text-sm font-semibold"
                >
                  Yelp-suggested search terms
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select a term to block it. Ads may still be eligible for
                  related searches not listed here.
                </p>
              </div>
              {suggestedKeywords.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {suggestedKeywords.map((keyword) => {
                    const checked = selectedSuggested.some(
                      (item) => keywordKey(item) === keywordKey(keyword),
                    );
                    const id = `suggested-${keywordKey(keyword).replace(/[^a-z0-9]+/g, "-")}`;

                    return (
                      <label
                        key={keyword}
                        htmlFor={id}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm hover:bg-muted/50"
                      >
                        <Checkbox
                          id={id}
                          checked={checked}
                          disabled={!canManage || isSaving || isClearing}
                          onCheckedChange={(next) =>
                            toggleSuggested(keyword, next === true)
                          }
                        />
                        <span
                          className={
                            checked
                              ? "font-medium text-destructive"
                              : "text-foreground"
                          }
                        >
                          {keyword}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                  Yelp returned no suggested terms for this program. Custom
                  exclusions can still be entered below.
                </div>
              )}
            </section>

            <section className="space-y-2">
              <Label htmlFor="custom-blocked-keywords">
                Custom blocked search terms
              </Label>
              <Textarea
                id="custom-blocked-keywords"
                value={customKeywords}
                disabled={!canManage || isSaving || isClearing}
                onChange={(event) => setCustomKeywords(event.target.value)}
                placeholder={"free hvac\nhvac jobs\ndiy air conditioner repair"}
                className="min-h-32"
              />
              <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Enter one term per line. Commas are also accepted. Duplicates
                  are removed.
                </span>
                <span>
                  {allBlockedKeywords.length}/{MAX_BLOCKED_KEYWORDS}
                </span>
              </div>
            </section>

            {canManage ? (
              <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-5">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        allBlockedKeywords.length === 0 ||
                        isSaving ||
                        isClearing
                      }
                    >
                      Clear all blocked keywords
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Clear all blocked keywords?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes every keyword exclusion from this Yelp
                        program. Yelp may immediately make the campaign eligible
                        for those searches again.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogDismiss>Cancel</AlertDialogDismiss>
                      <AlertDialogConfirm
                        disabled={isClearing}
                        onClick={() => {
                          void clearAll();
                        }}
                      >
                        {isClearing ? "Clearing..." : "Clear exclusions"}
                      </AlertDialogConfirm>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button
                  type="button"
                  disabled={
                    isSaving ||
                    isClearing ||
                    allBlockedKeywords.length > MAX_BLOCKED_KEYWORDS
                  }
                  onClick={() => {
                    void save();
                  }}
                >
                  <RefreshCw
                    className={isSaving ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                    aria-hidden="true"
                  />
                  {isSaving
                    ? writeMode === "LIVE"
                      ? "Saving and verifying..."
                      : "Saving demo snapshot..."
                    : writeMode === "LIVE"
                      ? "Save and verify on Yelp"
                      : "Save demo snapshot"}
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Your role can review keyword targeting but cannot change it.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
