"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CirclePause, Power, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogDismiss,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/utils/client-api";

type ManagedAction =
  | "ACTIVATE"
  | "PAUSE"
  | "EMERGENCY_DISABLE"
  | "CLEAR_EMERGENCY";

const actionCopy: Record<
  ManagedAction,
  { title: string; description: string; confirmation: string | null }
> = {
  ACTIVATE: {
    title: "Activate in review-only mode",
    description:
      "Activation is blocked unless every required connection, policy, limit, and worker check passes.",
    confirmation: "ACTIVATE REVIEW ONLY",
  },
  PAUSE: {
    title: "Pause this business",
    description:
      "Autoresponder processing and delivery will remain disabled until the business is reactivated.",
    confirmation: null,
  },
  EMERGENCY_DISABLE: {
    title: "Emergency disable",
    description:
      "This immediately blocks autoresponder activity for the business and requires operator remediation.",
    confirmation: "EMERGENCY DISABLE",
  },
  CLEAR_EMERGENCY: {
    title: "Clear emergency disable",
    description:
      "This removes the emergency block but keeps the business paused. Run readiness checks before activating again.",
    confirmation: "CLEAR EMERGENCY DISABLE",
  },
};

export function OnboardingBusinessActions({
  businessId,
  status,
  canActivate,
  emergencyDisabled,
}: {
  businessId: string;
  status: string;
  canActivate: boolean;
  emergencyDisabled: boolean;
}) {
  const router = useRouter();
  const [selectedAction, setSelectedAction] = useState<ManagedAction | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  async function submit(action: ManagedAction | "CHECK") {
    const checking = action === "CHECK";
    if (checking) {
      setIsChecking(true);
    } else {
      setIsSubmitting(true);
    }

    try {
      await apiFetch(
        `/api/onboarding/businesses/${encodeURIComponent(businessId)}/activation`,
        {
          method: "POST",
          body: JSON.stringify({
            action,
            ...(checking ? {} : { confirmation }),
          }),
        },
      );
      toast.success(
        checking ? "Readiness checks refreshed." : "Business status updated.",
      );
      setSelectedAction(null);
      setConfirmation("");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update onboarding.",
      );
    } finally {
      setIsChecking(false);
      setIsSubmitting(false);
    }
  }

  const copy = selectedAction ? actionCopy[selectedAction] : null;
  const confirmationValid =
    !copy?.confirmation || confirmation === copy.confirmation;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isChecking}
          onClick={() => submit("CHECK")}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {isChecking ? "Re-evaluating..." : "Re-evaluate"}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canActivate || status === "ACTIVE"}
          onClick={() => setSelectedAction("ACTIVATE")}
        >
          <Power className="h-4 w-4" aria-hidden="true" />
          Activate
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={status === "PAUSED"}
          onClick={() => setSelectedAction("PAUSE")}
        >
          <CirclePause className="h-4 w-4" aria-hidden="true" />
          Pause
        </Button>
        {emergencyDisabled ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelectedAction("CLEAR_EMERGENCY")}
          >
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            Clear emergency
          </Button>
        ) : (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setSelectedAction("EMERGENCY_DISABLE")}
          >
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            Disable
          </Button>
        )}
      </div>

      <AlertDialog
        open={selectedAction !== null}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) {
            setSelectedAction(null);
            setConfirmation("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
            <AlertDialogDescription>{copy?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          {copy?.confirmation ? (
            <div className="mt-4 space-y-2">
              <Label htmlFor={`confirmation-${businessId}`}>
                Enter <span className="font-mono">{copy.confirmation}</span>
              </Label>
              <Input
                id={`confirmation-${businessId}`}
                value={confirmation}
                autoComplete="off"
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogDismiss disabled={isSubmitting}>
              Cancel
            </AlertDialogDismiss>
            <Button
              type="button"
              variant={
                selectedAction === "EMERGENCY_DISABLE"
                  ? "destructive"
                  : "default"
              }
              disabled={!selectedAction || !confirmationValid || isSubmitting}
              onClick={() => selectedAction && submit(selectedAction)}
            >
              {isSubmitting ? "Applying..." : "Confirm"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
