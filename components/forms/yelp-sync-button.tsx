"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function YelpSyncButton({ label = "Sync from Yelp now" }: { label?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
    >
      {isPending ? "Syncing..." : label}
    </Button>
  );
}
