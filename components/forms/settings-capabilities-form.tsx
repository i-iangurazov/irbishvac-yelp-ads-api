"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { capabilityFlagsSchema } from "@/features/settings/schemas";
import { apiFetch } from "@/lib/utils/client-api";

export function SettingsCapabilitiesForm({
  defaultValues
}: {
  defaultValues: {
    adsApiEnabled: boolean;
    programFeatureApiEnabled: boolean;
    reportingApiEnabled: boolean;
    dataIngestionApiEnabled: boolean;
    businessMatchApiEnabled: boolean;
    demoModeEnabled: boolean;
  };
}) {
  const router = useRouter();
  const { setValue, watch, handleSubmit, formState: { isSubmitting } } = useForm({
    resolver: zodResolver(capabilityFlagsSchema),
    defaultValues
  });

  const values = watch();

  const submit = handleSubmit(async (payload) => {
    try {
      await apiFetch("/api/settings/capabilities", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      toast.success("Capability flags updated.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save capability flags.");
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capability toggles</CardTitle>
        <CardDescription>Use these switches to explicitly enable only the Yelp APIs available in this environment.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          {Object.entries(values).map(([key, value]) => (
            <Label className="flex items-center justify-between rounded-lg border border-border p-4" key={key}>
              <div>
                <div className="font-medium">{key}</div>
                <div className="text-sm text-muted-foreground">
                  {value ? "Enabled for this tenant/environment" : "Disabled until Yelp enablement and credentials are ready"}
                </div>
              </div>
              <Switch checked={value} onCheckedChange={(checked) => setValue(key as keyof typeof values, checked)} />
            </Label>
          ))}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save capability flags"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
