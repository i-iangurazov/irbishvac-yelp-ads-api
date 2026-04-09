"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  serviceTitanConnectorFormSchema,
  type ServiceTitanConnectorFormValues
} from "@/features/crm-connector/schemas";
import { apiFetch } from "@/lib/utils/client-api";

const defaultUrls = {
  INTEGRATION: {
    apiBaseUrl: "https://api-integration.servicetitan.io",
    authBaseUrl: "https://auth-integration.servicetitan.io"
  },
  PRODUCTION: {
    apiBaseUrl: "https://api.servicetitan.io",
    authBaseUrl: "https://auth.servicetitan.io"
  }
} as const;

export function ServiceTitanConnectorForm({
  defaultValues
}: {
  defaultValues: ServiceTitanConnectorFormValues;
}) {
  const [isTesting, setIsTesting] = useState(false);
  const {
    register,
    setValue,
    getValues,
    watch,
    reset,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<ServiceTitanConnectorFormValues>({
    resolver: zodResolver(serviceTitanConnectorFormSchema),
    defaultValues
  });

  const environment = watch("environment");

  useEffect(() => {
    const defaults = defaultUrls[environment];
    const values = getValues();

    if (!values.apiBaseUrl || Object.values(defaultUrls).some((entry) => entry.apiBaseUrl === values.apiBaseUrl)) {
      setValue("apiBaseUrl", defaults.apiBaseUrl, { shouldDirty: true });
    }

    if (!values.authBaseUrl || Object.values(defaultUrls).some((entry) => entry.authBaseUrl === values.authBaseUrl)) {
      setValue("authBaseUrl", defaults.authBaseUrl, { shouldDirty: true });
    }
  }, [environment, getValues, setValue]);

  const submit = handleSubmit(async (values) => {
    try {
      await apiFetch("/api/integrations/servicetitan/config", {
        method: "POST",
        body: JSON.stringify(values)
      });
      reset({
        ...values,
        clientSecret: ""
      });
      toast.success("ServiceTitan connector saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save ServiceTitan connector.");
    }
  });

  const saveAndTest = async () => {
    const values = getValues();

    try {
      setIsTesting(true);
      await apiFetch("/api/integrations/servicetitan/config", {
        method: "POST",
        body: JSON.stringify(values)
      });
      const result = await apiFetch<{ message: string }>("/api/integrations/servicetitan/test", {
        method: "POST"
      });
      reset({
        ...values,
        clientSecret: ""
      });
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ServiceTitan test failed.");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>ServiceTitan connector</CardTitle>
        <CardDescription>
          Save connector credentials, tenant configuration, and environment in one place. Secrets are encrypted and never shown after save.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="label">Label</Label>
              <Input id="label" {...register("label")} />
            </div>
            <div className="space-y-2">
              <Label>Environment</Label>
              <Select
                defaultValue={watch("environment")}
                onValueChange={(value) => setValue("environment", value as ServiceTitanConnectorFormValues["environment"])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INTEGRATION">Integration</SelectItem>
                  <SelectItem value="PRODUCTION">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenantId">Tenant ID</Label>
              <Input id="tenantId" {...register("tenantId")} placeholder="e.g. 985798691" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appKey">App key</Label>
              <Input id="appKey" {...register("appKey")} placeholder="ServiceTitan app key" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientId">Client ID</Label>
              <Input id="clientId" {...register("clientId")} placeholder="Client ID" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientSecret">Client secret</Label>
              <Input id="clientSecret" type="password" {...register("clientSecret")} placeholder="Only re-enter when rotating" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiBaseUrl">API base URL</Label>
              <Input id="apiBaseUrl" {...register("apiBaseUrl")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="authBaseUrl">Auth base URL</Label>
              <Input id="authBaseUrl" {...register("authBaseUrl")} />
            </div>
          </div>

          <Label className="flex items-center justify-between rounded-xl border border-border p-4">
            <div>
              <div className="font-medium">Enabled</div>
              <div className="text-sm text-muted-foreground">
                Turn off only if you need to pause live connector reads and reference-data sync.
              </div>
            </div>
            <Switch checked={watch("isEnabled")} onCheckedChange={(checked) => setValue("isEnabled", checked)} />
          </Label>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save connector"}
            </Button>
            <Button type="button" variant="outline" onClick={saveAndTest} disabled={isSubmitting || isTesting}>
              {isTesting ? "Saving and testing..." : "Save + test"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

