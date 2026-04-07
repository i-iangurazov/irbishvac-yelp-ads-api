import { redirect } from "next/navigation";

import { LeadAutomationRuleForm } from "@/components/forms/lead-automation-rule-form";
import { LeadAutomationTemplateForm } from "@/components/forms/lead-automation-template-form";
import { LeadAutoresponderSettingsForm } from "@/components/forms/lead-autoresponder-settings-form";
import { SettingsCapabilitiesForm } from "@/components/forms/settings-capabilities-form";
import { SettingsCredentialForm } from "@/components/forms/settings-credential-form";
import { SettingsUserRoleForm } from "@/components/forms/settings-user-role-form";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getLeadAutomationAdminState } from "@/features/autoresponder/service";
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

export default async function SettingsPage({
  searchParams
}: {
  searchParams: Promise<{
    templateId?: string;
    ruleId?: string;
  }>;
}) {
  const user = await requireUser();

  if (user.role.code !== "ADMIN") {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const [settings, automation] = await Promise.all([
    getSettingsOverview(user.tenantId),
    getLeadAutomationAdminState(user.tenantId)
  ]);

  const credentialMap = new Map(settings.credentials.map((credential) => [credential.kind, credential]));
  const selectedTemplate = params.templateId
    ? automation.templates.find((template) => template.id === params.templateId) ?? null
    : null;
  const selectedRule = params.ruleId ? automation.rules.find((rule) => rule.id === params.ruleId) ?? null : null;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Admin controls for credentials, access gating, and tenant-level automation."
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

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6 scroll-mt-24" id="autoresponder">
          <LeadAutoresponderSettingsForm
            defaultValues={automation.settings}
            smtpConfigured={automation.smtpConfigured}
          />

          <Card>
            <CardHeader>
              <CardTitle>Templates</CardTitle>
              <CardDescription>Email-only first-response templates. The rendered message is stored on the lead record for operator review.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Rules</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {automation.templates.length === 0 ? (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={5}>
                        No templates saved yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    automation.templates.map((template) => (
                      <TableRow key={template.id}>
                        <TableCell>
                          <div className="font-medium">{template.name}</div>
                          <div className="text-xs text-muted-foreground">{template.channel}</div>
                        </TableCell>
                        <TableCell>
                          <StatusChip status={template.isEnabled ? "ACTIVE" : "INACTIVE"} />
                        </TableCell>
                        <TableCell>{template._count.rules}</TableCell>
                        <TableCell>{template._count.attempts}</TableCell>
                        <TableCell className="text-right">
                          <a className="text-sm font-medium hover:underline" href={`/settings?templateId=${template.id}`}>
                            Edit
                          </a>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rules</CardTitle>
              <CardDescription>Rules match new leads by location and service. Unmatched leads record a visible skip instead of sending a hidden fallback.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {automation.rules.length === 0 ? (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={5}>
                        No rules saved yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    automation.rules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell>
                          <div className="font-medium">{rule.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Priority {rule.priority} • {rule.template.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{rule.location?.name ?? "All locations"}</div>
                          <div className="text-xs text-muted-foreground">{rule.serviceCategory?.name ?? "All services"}</div>
                        </TableCell>
                        <TableCell className="max-w-[18rem] text-xs text-muted-foreground">
                          {rule.workingHoursLabel}
                        </TableCell>
                        <TableCell>
                          <StatusChip status={rule.isEnabled ? "ACTIVE" : "INACTIVE"} />
                        </TableCell>
                        <TableCell className="text-right">
                          <a className="text-sm font-medium hover:underline" href={`/settings?ruleId=${rule.id}`}>
                            Edit
                          </a>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <LeadAutomationTemplateForm
            initialValues={
              selectedTemplate
                ? {
                    name: selectedTemplate.name,
                    channel: selectedTemplate.channel,
                    isEnabled: selectedTemplate.isEnabled,
                    subjectTemplate: selectedTemplate.subjectTemplate ?? "",
                    bodyTemplate: selectedTemplate.bodyTemplate
                  }
                : null
            }
            templateId={selectedTemplate?.id ?? null}
          />

          {automation.templates.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>New rule</CardTitle>
                <CardDescription>Create at least one template before adding rules.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <LeadAutomationRuleForm
              initialValues={
                selectedRule
                  ? {
                      name: selectedRule.name,
                      templateId: selectedRule.templateId,
                      channel: selectedRule.channel,
                      isEnabled: selectedRule.isEnabled,
                      priority: selectedRule.priority,
                      locationId: selectedRule.locationId ?? "",
                      serviceCategoryId: selectedRule.serviceCategoryId ?? "",
                      onlyDuringWorkingHours: selectedRule.onlyDuringWorkingHours,
                      timezone: selectedRule.timezone ?? "",
                      workingDays: selectedRule.workingDays,
                      startMinute: selectedRule.startMinute ?? undefined,
                      endMinute: selectedRule.endMinute ?? undefined
                    }
                  : null
              }
              locations={automation.options.locations}
              ruleId={selectedRule?.id ?? null}
              serviceCategories={automation.options.serviceCategories}
              templates={automation.templates.map((template) => ({
                id: template.id,
                name: template.name,
                isEnabled: template.isEnabled,
                channel: template.channel
              }))}
            />
          )}
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
