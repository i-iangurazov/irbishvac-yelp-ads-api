"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/utils/client-api";

export function LeadSyncForm({
  businesses,
  defaultBusinessId,
  capabilityEnabled
}: {
  businesses: Array<{ id: string; name: string }>;
  defaultBusinessId?: string;
  capabilityEnabled: boolean;
}) {
  const router = useRouter();
  const initialBusinessId = useMemo(
    () => (defaultBusinessId && businesses.some((business) => business.id === defaultBusinessId) ? defaultBusinessId : businesses[0]?.id ?? ""),
    [businesses, defaultBusinessId]
  );
  const [businessId, setBusinessId] = useState(initialBusinessId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSync() {
    if (!businessId) {
      toast.error("Choose a business first.");
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await apiFetch<{
        status: string;
        importedCount: number;
        updatedCount: number;
        failedCount: number;
        returnedLeadIds: number;
        hasMore: boolean;
      }>("/api/leads/sync", {
        method: "POST",
        body: JSON.stringify({ businessId })
      });

      toast.success(
        result.hasMore
          ? `Imported ${result.importedCount} new leads and refreshed ${result.updatedCount}. Yelp reported more lead IDs than were included in this response.`
          : `Imported ${result.importedCount} new leads and refreshed ${result.updatedCount}.`
      );
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sync Yelp leads.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end">
      <div className="min-w-[16rem] flex-1 space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="lead-sync-business">
          Import business
        </label>
        <select
          className="ui-native-select"
          disabled={!capabilityEnabled || businesses.length === 0 || isSubmitting}
          id="lead-sync-business"
          onChange={(event) => setBusinessId(event.target.value)}
          value={businessId}
        >
          {businesses.length === 0 ? <option value="">No saved businesses</option> : null}
          {businesses.map((business) => (
            <option key={business.id} value={business.id}>
              {business.name}
            </option>
          ))}
        </select>
      </div>
      <Button disabled={!capabilityEnabled || !businessId || isSubmitting} onClick={handleSync} type="button">
        {isSubmitting ? "Importing..." : "Import from Yelp"}
      </Button>
    </div>
  );
}
