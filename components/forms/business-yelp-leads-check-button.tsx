"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/utils/client-api";

export function BusinessYelpLeadsCheckButton({
  businessId,
  disabled
}: {
  businessId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function runCheck() {
    try {
      setIsPending(true);
      const result = await apiFetch<{ message?: string }>(`/api/businesses/${businessId}/yelp-leads-check`, {
        method: "POST"
      });

      toast.success(result.message ?? "Yelp Leads API check completed.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to check Yelp Leads API access.");
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
        void runCheck();
      }}
    >
      {isPending ? "Checking..." : "Check Leads API"}
    </Button>
  );
}
