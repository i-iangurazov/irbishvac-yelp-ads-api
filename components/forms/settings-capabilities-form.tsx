"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { capabilityFlagDefinitions, type CapabilityFlags } from "@/features/settings/capabilities";
import { capabilityFlagsSchema } from "@/features/settings/schemas";
import { apiFetch } from "@/lib/utils/client-api";

const capabilitySections = [
  {
    title: "Live operator workflows",
    description: "Enable these only when the tenant can use the current production flows end to end.",
    keys: ["hasAdsApi", "hasLeadsApi", "hasReportingApi", "hasCrmIntegration", "programFeatureApiEnabled"] as Array<keyof CapabilityFlags>
  },
  {
    title: "Restricted and future capabilities",
    description: "These flags cover optional partner access, future integrations, or local testing paths. They should not imply a broader live workflow by themselves.",
    keys: ["hasPartnerSupportApi", "hasConversionsApi", "demoModeEnabled"] as Array<keyof CapabilityFlags>
  }
] as const;

export function SettingsCapabilitiesForm({
  defaultValues
}: {
  defaultValues: CapabilityFlags;
}) {
  const router = useRouter();
  const {
    setValue,
    watch,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<CapabilityFlags>({
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
        <CardDescription>Enable only the surfaces that are actually available in this environment.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          {capabilitySections.map((section) => (
            <div className="space-y-3" key={section.title}>
              <div>
                <div className="font-medium">{section.title}</div>
                <div className="text-sm text-muted-foreground">{section.description}</div>
              </div>
              {section.keys.map((key) => {
                const definition = capabilityFlagDefinitions.find((item) => item.key === key);

                if (!definition) {
                  return null;
                }

                return (
                  <Label className="flex items-center justify-between rounded-lg border border-border p-4" key={definition.key}>
                    <div>
                      <div className="font-medium">{definition.label}</div>
                      <div className="text-sm text-muted-foreground">{definition.description}</div>
                    </div>
                    <Switch
                      checked={values[definition.key]}
                      onCheckedChange={(checked) => setValue(definition.key, checked)}
                    />
                  </Label>
                );
              })}
            </div>
          ))}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save capability flags"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
