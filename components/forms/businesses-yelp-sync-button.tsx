"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/utils/client-api";

type BusinessesYelpSyncResult = {
  source: string;
  checked: number;
  active: number;
  migrated: number;
  notFound: number;
  noAccess: number;
  errors: number;
};

export function BusinessesYelpSyncButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function runSync() {
    try {
      setIsPending(true);
      const result = await apiFetch<BusinessesYelpSyncResult>(
        "/api/businesses/sync",
        {
          method: "POST",
        },
      );

      if (result.migrated > 0 || result.notFound > 0 || result.errors > 0) {
        toast.warning(
          `Business sync checked ${result.checked}. Migrated: ${result.migrated}; not found: ${result.notFound}; errors: ${result.errors}.`,
        );
      } else {
        toast.success(`Business sync checked ${result.checked} businesses.`);
      }

      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to sync Yelp businesses.",
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || isPending}
      onClick={() => {
        void runSync();
      }}
    >
      <RefreshCw className={isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
      {isPending ? "Syncing..." : "Sync Yelp businesses"}
    </Button>
  );
}
