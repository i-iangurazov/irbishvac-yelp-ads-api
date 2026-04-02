import { redirect } from "next/navigation";

import { SettingsCapabilitiesForm } from "@/components/forms/settings-capabilities-form";
import { SettingsCredentialForm } from "@/components/forms/settings-credential-form";
import { SettingsUserRoleForm } from "@/components/forms/settings-user-role-form";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSettingsOverview } from "@/features/settings/service";
import { requireUser } from "@/lib/auth/service";

function credentialDefaults(
  credential:
    | {
        kind: string;
        label: string;
        baseUrl: string | null;
        isEnabled: boolean;
        metadataJson: unknown;
      }
    | undefined
) {
  if (!credential) {
    return undefined;
  }

  return {
    label: credential.label,
    baseUrl: credential.baseUrl,
    isEnabled: credential.isEnabled,
    testPath:
      credential.kind === "ADS_BASIC_AUTH" && (credential.metadataJson as { testPath?: string } | null)?.testPath === "/"
        ? ""
        : ((credential.metadataJson as { testPath?: string } | null)?.testPath ?? "")
  };
}

export default async function SettingsPage() {
  const user = await requireUser();

  if (user.role.code !== "ADMIN") {
    redirect("/dashboard");
  }

  const settings = await getSettingsOverview(user.tenantId);

  const credentialMap = new Map(settings.credentials.map((credential) => [credential.kind, credential]));

  return (
    <div>
      <PageHeader
        title="Admin settings"
        description="Manage encrypted credentials, capability flags, tenant access roles, and the operational configuration surface."
      />

      <Card className="mb-6 border-border/70 bg-muted/20">
        <CardHeader>
          <CardTitle>Env var mapping</CardTitle>
          <CardDescription>Use this to map existing Yelp secrets into the current Admin Settings model.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div>
            `YELP_API_KEY`: maps to the `Fusion API Key` form today and is the current reporting credential we support directly.
          </div>
          <div>
            `YELP_CLIENT_ID`, `YELP_CLIENT_SECRET`, and `YELP_REDIRECT_URI`: OAuth or business-access values. They are not wired into a dedicated settings form yet, but they are the right inputs for the upcoming Yelp OAuth/business-access integration layer.
          </div>
          <div>
            `YELP_ALLOWED_BUSINESS_IDS`: optional allowlist input for business-access scoping. It is recognized as an environment value now, but the enforcement or subscription-coverage UI has not been implemented yet.
          </div>
          <div>
            Partner API Basic Auth, Business Match, and Data Ingestion still expect the Yelp-issued username and secret pairs from partner onboarding or support.
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SettingsCapabilitiesForm defaultValues={settings.capabilities} />

        <div className="grid gap-6">
          <SettingsCredentialForm kind="ADS_BASIC_AUTH" defaultValues={credentialDefaults(credentialMap.get("ADS_BASIC_AUTH"))} />
          <SettingsCredentialForm kind="REPORTING_FUSION" defaultValues={credentialDefaults(credentialMap.get("REPORTING_FUSION"))} />
          <SettingsCredentialForm kind="BUSINESS_MATCH" defaultValues={credentialDefaults(credentialMap.get("BUSINESS_MATCH"))} />
          <SettingsCredentialForm kind="DATA_INGESTION" defaultValues={credentialDefaults(credentialMap.get("DATA_INGESTION"))} />
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Roles and permissions</CardTitle>
          <CardDescription>Only admins can change credentials and destructive permissions.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.users.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>{member.name}</TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>
                    <SettingsUserRoleForm userId={member.id} roleCode={member.role.code} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
