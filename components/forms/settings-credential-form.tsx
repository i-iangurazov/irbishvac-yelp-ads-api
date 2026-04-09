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
    source: "Yelp partner onboarding or partner support.",
    howToGet:
      "Use the Partner API username and password Yelp issued for this environment. If they are missing, ask your Yelp partner contact to provision or resend them.",
    baseUrlNote:
      "Keep the default base URL unless Yelp gave you an environment-specific host."
  },
  REPORTING_FUSION: {
    source: "Yelp-issued bearer token for Yelp Partner APIs under api.yelp.com.",
    howToGet:
      "Paste the Yelp access token Yelp issued for this tenant or environment. This console uses it for Leads and other bearer-auth Yelp APIs under api.yelp.com. If your team still stores it in env, YELP_ACCESS_TOKEN is the preferred name.",
    baseUrlNote:
      "Keep the default api.yelp.com host unless Yelp gave you a different bearer-auth endpoint."
  },
  BUSINESS_MATCH: {
    source: "Yelp partner support when Business Match is enabled.",
    howToGet:
      "Use the username and secret Yelp provides for Business Match. If the feature is unavailable, confirm access with Yelp before saving anything here.",
    baseUrlNote:
      "Keep the default base URL unless Yelp assigned a different Business Match endpoint."
  },
  DATA_INGESTION: {
    source: "Yelp partner support for Data Ingestion access.",
    howToGet:
      "Use the username and secret Yelp issued for Data Ingestion. Save this only if Yelp has enabled ingestion for this tenant.",
    baseUrlNote:
      "Keep the default base URL unless Yelp gave you a tenant-specific ingestion host."
  },
  CRM_SERVICETITAN: {
    source: "ServiceTitan customer admin or integration owner.",
    howToGet:
      "Use the ServiceTitan connector workflow on the Integrations page for live setup. This generic Settings form is not the primary path for ServiceTitan.",
    baseUrlNote:
      "Use the dedicated Integrations page so environment, tenant ID, app key, and auth host stay aligned."
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
        <CardDescription>Encrypted server-side and never shown again after save.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="rounded-lg border border-border/70 bg-muted/30 p-4 text-sm">
            <div className="font-medium">How to get it</div>
            <div className="mt-2 text-muted-foreground">{instructions.source}</div>
            <div className="mt-1 text-muted-foreground">{instructions.howToGet}</div>
            <div className="mt-1 text-muted-foreground">{instructions.baseUrlNote}</div>
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
            <Label>{kind === "REPORTING_FUSION" ? "Access token" : "Password / secret"}</Label>
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
              Optional. Leave blank unless Yelp gave you a safe readable path.
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
              {isSubmitting ? "Saving..." : "Save changes"}
            </Button>
            <Button type="button" variant="outline" onClick={testConnection} disabled={isSubmitting || isTesting}>
              {isTesting ? "Saving and testing..." : "Save + test"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
