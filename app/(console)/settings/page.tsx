import Link from "next/link";
import { redirect } from "next/navigation";

import { SettingsCapabilitiesForm } from "@/components/forms/settings-capabilities-form";
import { SettingsCredentialForm } from "@/components/forms/settings-credential-form";
import { SettingsUserRoleForm } from "@/components/forms/settings-user-role-form";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getLeadAutomationModuleState } from "@/features/autoresponder/service";
import { getSettingsOverview } from "@/features/settings/service";
import { requireUser } from "@/lib/auth/service";
import { formatDateTime } from "@/lib/utils/format";

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

function channelLabel(channel: string | null | undefined) {
  return channel === "EMAIL" ? "Yelp masked email" : "Yelp thread";
}

export default async function SettingsPage() {
  const user = await requireUser();

  if (user.role.code !== "ADMIN") {
    redirect("/dashboard");
  }

  const [settings, automation] = await Promise.all([
    getSettingsOverview(user.tenantId),
    getLeadAutomationModuleState(user.tenantId)
  ]);

  const credentialMap = new Map(settings.credentials.map((credential) => [credential.kind, credential]));

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Admin controls for Yelp access, partner gating, and in-thread automation."
        actions={<Badge variant="outline">Admin only</Badge>}
      />

      <div className="mb-6 rounded-2xl border border-border/80 bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
        Save credentials first, then enable only the surfaces the tenant can actually use.
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SettingsCapabilitiesForm defaultValues={settings.capabilities} />

        <div className="grid gap-6">
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Live credentials</h2>
              <p className="text-sm text-muted-foreground">Use these for the live operator workflow. Ads uses partner basic auth; Leads and other Yelp bearer-auth reads use the access token.</p>
            </div>
            <SettingsCredentialForm kind="ADS_BASIC_AUTH" defaultValues={credentialDefaults(credentialMap.get("ADS_BASIC_AUTH"))} />
            <SettingsCredentialForm kind="REPORTING_FUSION" defaultValues={credentialDefaults(credentialMap.get("REPORTING_FUSION"))} />
          </div>

          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Limited-scope credentials</h2>
              <p className="text-sm text-muted-foreground">Keep these for restricted helper flows and future integrations. They are not the primary live path today.</p>
            </div>
            <SettingsCredentialForm kind="BUSINESS_MATCH" defaultValues={credentialDefaults(credentialMap.get("BUSINESS_MATCH"))} />
            <SettingsCredentialForm kind="DATA_INGESTION" defaultValues={credentialDefaults(credentialMap.get("DATA_INGESTION"))} />
          </div>
        </div>
      </div>

      <Card className="mt-6 border-border/70 bg-muted/20">
        <CardHeader>
          <CardTitle>External OAuth and allowlist inputs</CardTitle>
          <CardDescription>These values are recognized by the repo, but the full OAuth and business-coverage flow still lives outside this product.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <div><span className="font-mono">YELP_ACCESS_TOKEN</span> maps to the Yelp API bearer token use case and stays available as an env fallback.</div>
          <div><span className="font-mono">YELP_API_KEY</span> remains a legacy fallback name in this repo, but the preferred bearer-token name is <span className="font-mono">YELP_ACCESS_TOKEN</span>.</div>
          <div><span className="font-mono">YELP_CLIENT_ID</span>, <span className="font-mono">YELP_CLIENT_SECRET</span>, and <span className="font-mono">YELP_REDIRECT_URI</span> are valid OAuth inputs, but this console does not manage token exchange yet.</div>
          <div><span className="font-mono">YELP_ALLOWED_BUSINESS_IDS</span> is recognized, but allowlist enforcement and subscription coverage still need a dedicated operator flow.</div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Autoresponder module</CardTitle>
          <CardDescription>Initial-response policy, later follow-ups, templates, AI review assist, and delivery health now live in the dedicated autoresponder workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border/80 bg-muted/10 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Status</div>
              <div className="mt-2 flex items-center gap-2">
                <StatusChip status={automation.moduleSummary.isEnabled ? "ACTIVE" : "INACTIVE"} />
                <span className="text-sm text-muted-foreground">{channelLabel(automation.moduleSummary.defaultChannel)}</span>
              </div>
            </div>
            <div className="rounded-xl border border-border/80 bg-muted/10 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Live coverage</div>
              <div className="mt-2 text-sm font-medium">
                {automation.moduleSummary.enabledRuleCount} rules • {automation.moduleSummary.enabledTemplateCount} templates
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{automation.operatingMode.liveTemplateMode}</div>
            </div>
            <div className="rounded-xl border border-border/80 bg-muted/10 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">AI draft assist</div>
              <div className="mt-2 text-sm font-medium">
                {automation.aiAssist.enabled ? "Enabled" : "Disabled"} • Review required
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {automation.aiAssist.envConfigured ? automation.aiAssist.modelLabel : "OpenAI key not configured"}
              </div>
            </div>
            <div className="rounded-xl border border-border/80 bg-muted/10 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recent delivery health</div>
              <div className="mt-2 text-sm font-medium">
                {automation.moduleSummary.failedCount} failed • {automation.moduleSummary.openIssueCount} open issues
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {automation.moduleSummary.lastSuccessfulAt
                  ? `Last successful send ${formatDateTime(automation.moduleSummary.lastSuccessfulAt)}`
                  : "No successful send recorded yet"}
              </div>
            </div>
          </div>

          <div className="flex justify-start">
            <Button asChild>
              <Link href="/autoresponder">Open autoresponder module</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

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
