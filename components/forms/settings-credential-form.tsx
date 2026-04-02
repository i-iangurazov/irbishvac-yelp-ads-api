"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { CredentialKind } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { credentialFormSchema, credentialKindLabels } from "@/features/settings/schemas";
import { apiFetch } from "@/lib/utils/client-api";

const credentialInstructions: Record<
  CredentialKind,
  {
    source: string;
    howToGet: string;
    baseUrlNote: string;
  }
> = {
  ADS_BASIC_AUTH: {
    source: "Source: Yelp partner onboarding or Yelp partner support.",
    howToGet:
      "Use the Partner API username and password Yelp issued for your partner account. If your team does not already have them, ask your Yelp partner manager or technical support contact to provision or resend the Partner API Basic Auth credentials for this environment. These are separate from OAuth values like YELP_CLIENT_ID and YELP_CLIENT_SECRET.",
    baseUrlNote:
      "Leave the base URL on the default unless Yelp gave you an environment-specific Partner API host."
  },
  REPORTING_FUSION: {
    source: "Source: Yelp-issued Fusion API key with reporting access.",
    howToGet:
      "Paste the reporting API key Yelp provided for this tenant or environment. This form only needs the key, not a username. If your team already stores that value as YELP_API_KEY in .env, that is the value to paste here. If you only have a generic Fusion key and reporting calls are not enabled, confirm with Yelp that reporting access is attached to that key.",
    baseUrlNote:
      "Leave the base URL on the default Fusion host unless Yelp gave you a different reporting endpoint."
  },
  BUSINESS_MATCH: {
    source: "Source: Yelp partner support when Business Match is enabled.",
    howToGet:
      "Use the username and secret Yelp provides for Business Match. Many tenants will not have this capability enabled. If the feature is still unavailable, ask Yelp to confirm Business Match access before saving credentials here.",
    baseUrlNote:
      "Use the default base URL unless Yelp explicitly assigned a different Business Match endpoint."
  },
  DATA_INGESTION: {
    source: "Source: Yelp partner support for Data Ingestion access.",
    howToGet:
      "Use the username and secret Yelp issued for Data Ingestion. Save this only if Yelp has enabled the ingestion capability for your tenant. If your team is missing these values, request the Data Ingestion credentials from Yelp together with the allowed endpoints for your account.",
    baseUrlNote:
      "Leave the default base URL in place unless Yelp gave you a tenant-specific ingestion host."
  }
};

export function SettingsCredentialForm({
  kind,
  defaultValues
}: {
  kind: CredentialKind;
  defaultValues?: {
    label?: string;
    baseUrl?: string | null;
    isEnabled?: boolean;
    testPath?: string | null;
  };
}) {
  const [isTesting, setIsTesting] = useState(false);
  const instructions = credentialInstructions[kind];
  const {
    register,
    setValue,
    getValues,
    reset,
    watch,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm({
    resolver: zodResolver(credentialFormSchema),
    defaultValues: {
      kind,
      label: defaultValues?.label ?? credentialKindLabels[kind],
      username: "",
      secret: "",
      baseUrl: defaultValues?.baseUrl ?? "",
      isEnabled: defaultValues?.isEnabled ?? true,
      testPath: defaultValues?.testPath ?? ""
    }
  });

  const submit = handleSubmit(async (values) => {
    try {
      await apiFetch("/api/settings/credentials", {
        method: "POST",
        body: JSON.stringify(values)
      });
      reset({
        ...values,
        username: "",
        secret: ""
      });
      toast.success(`${credentialKindLabels[kind]} saved.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save credentials.");
    }
  });

  const testConnection = async () => {
    const values = getValues();

    try {
      setIsTesting(true);

      await apiFetch("/api/settings/credentials", {
        method: "POST",
        body: JSON.stringify(values)
      });

      const result = await apiFetch<{ status: "SUCCESS" | "FAILED"; message: string }>("/api/settings/credentials/test", {
        method: "POST",
        body: JSON.stringify({ kind })
      });

      reset({
        ...values,
        username: "",
        secret: ""
      });

      if (result.status === "SUCCESS") {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connection test failed.");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{credentialKindLabels[kind]}</CardTitle>
        <CardDescription>Secrets are encrypted server-side and never rendered back after save.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="rounded-lg border border-border/70 bg-muted/30 p-4 text-sm">
            <div className="font-medium">How to get this credential</div>
            <div className="mt-2 text-muted-foreground">{instructions.source}</div>
            <div className="mt-2 text-muted-foreground">{instructions.howToGet}</div>
            <div className="mt-2 text-muted-foreground">{instructions.baseUrlNote}</div>
          </div>
          <Input type="hidden" {...register("kind")} />
          <div className="space-y-2">
            <Label>Label</Label>
            <Input {...register("label")} />
          </div>
          {kind !== "REPORTING_FUSION" ? (
            <div className="space-y-2">
              <Label>Username</Label>
              <Input {...register("username")} placeholder="Only re-enter when changing" />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>{kind === "REPORTING_FUSION" ? "API key" : "Password / secret"}</Label>
            <Input type="password" {...register("secret")} placeholder="Only re-enter when rotating" />
          </div>
          <div className="space-y-2">
            <Label>Base URL</Label>
            <Input {...register("baseUrl")} />
            <p className="text-sm text-muted-foreground">{instructions.baseUrlNote}</p>
          </div>
          <div className="space-y-2">
            <Label>Connection test path</Label>
            <Input {...register("testPath")} placeholder="/some-safe-read-endpoint" />
            <p className="text-sm text-muted-foreground">
              Optional. Yelp Ads docs do not publish a generic health endpoint, so leave this blank unless Yelp gave you a safe readable path.
            </p>
          </div>
          <Label className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <div className="font-medium">Enabled</div>
              <div className="text-sm text-muted-foreground">Enabled by default after saving credentials. Turn off only if you need to pause live requests.</div>
            </div>
            <Switch checked={watch("isEnabled")} onCheckedChange={(checked) => setValue("isEnabled", checked)} />
          </Label>
          <div className="flex gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
            <Button type="button" variant="outline" onClick={testConnection} disabled={isSubmitting || isTesting}>
              {isTesting ? "Saving and testing..." : "Save and test"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
