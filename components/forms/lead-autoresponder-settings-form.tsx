"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  leadAutoresponderSettingsSchema,
  type LeadAutoresponderSettingsValues
} from "@/features/autoresponder/schemas";
import { apiFetch } from "@/lib/utils/client-api";

export function LeadAutoresponderSettingsForm({
  defaultValues,
  smtpConfigured
}: {
  defaultValues: LeadAutoresponderSettingsValues;
  smtpConfigured: boolean;
}) {
  const router = useRouter();
  const { handleSubmit, watch, setValue, formState: { isSubmitting } } = useForm<LeadAutoresponderSettingsValues>({
    resolver: zodResolver(leadAutoresponderSettingsSchema),
    defaultValues
  });

  const submit = handleSubmit(async (values) => {
    try {
      await apiFetch("/api/settings/autoresponder", {
        method: "POST",
        body: JSON.stringify(values)
      });
      toast.success("Lead autoresponder settings saved.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save lead autoresponder settings.");
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead autoresponder</CardTitle>
        <CardDescription>Admin-controlled first response for newly ingested Yelp leads. Prefer the Yelp thread when live thread replies are available; use external email as fallback.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/10 px-4 py-3">
            <div>
              <div className="text-sm font-medium">Enabled</div>
              <div className="text-xs text-muted-foreground">
                New leads evaluate autoresponder rules immediately after intake.
              </div>
            </div>
            <Switch checked={watch("isEnabled")} onCheckedChange={(checked) => setValue("isEnabled", checked)} />
          </div>

          <div className="space-y-2">
            <Label>Default channel</Label>
            <Select defaultValue={watch("defaultChannel")} onValueChange={(value) => setValue("defaultChannel", value as "YELP_THREAD" | "EMAIL")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="YELP_THREAD">Yelp thread</SelectItem>
                <SelectItem value="EMAIL">External email</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Yelp thread replies use the Leads API write endpoints. SMTP is{" "}
              <span className="font-medium">{smtpConfigured ? "configured" : "not configured"}</span> for external email fallback.
            </p>
          </div>

          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? "Saving..." : "Save autoresponder settings"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
