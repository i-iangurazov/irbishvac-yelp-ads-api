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
