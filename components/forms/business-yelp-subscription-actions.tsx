"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/utils/client-api";

type SubscriptionAction = "REQUEST_WEBHOOK" | "VERIFY_WEBHOOK";

export function BusinessYelpSubscriptionActions({
  businessId,
  disabled
}: {
  businessId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<SubscriptionAction | null>(null);

  async function runAction(action: SubscriptionAction) {
    try {
      setPendingAction(action);
      const result = await apiFetch<{ message?: string }>(`/api/businesses/${businessId}/yelp-subscription`, {
        method: "POST",
        body: JSON.stringify({ action })
      });

      toast.success(result.message ?? "Yelp subscription state updated.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update Yelp subscription state.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={disabled || Boolean(pendingAction)}
        onClick={() => {
          void runAction("REQUEST_WEBHOOK");
        }}
      >
        {pendingAction === "REQUEST_WEBHOOK" ? "Requesting..." : "Request webhook subscription"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={disabled || Boolean(pendingAction)}
        onClick={() => {
          void runAction("VERIFY_WEBHOOK");
        }}
      >
        {pendingAction === "VERIFY_WEBHOOK" ? "Checking..." : "Check subscription"}
      </Button>
    </div>
  );
}
