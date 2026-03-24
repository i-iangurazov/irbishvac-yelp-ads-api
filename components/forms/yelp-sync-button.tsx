"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/utils/client-api";

export function YelpSyncButton({
  label = "Sync from Yelp now",
  syncPath
}: {
  label?: string;
  syncPath?: string;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    try {
      setIsPending(true);

      if (syncPath) {
        const result = await apiFetch<{ message?: string }>(syncPath, {
          method: "POST",
          body: JSON.stringify({})
        });

        toast.success(result.message ?? "Yelp sync completed.");
      }

      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sync from Yelp.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        void handleClick();
      }}
    >
      {isPending ? "Syncing..." : label}
    </Button>
  );
}
