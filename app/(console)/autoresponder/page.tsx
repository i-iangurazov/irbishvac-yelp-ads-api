import Link from "next/link";
import { redirect } from "next/navigation";

import { LeadAutomationRuleForm } from "@/components/forms/lead-automation-rule-form";
import { LeadAutomationTemplateForm } from "@/components/forms/lead-automation-template-form";
import { LeadAutoresponderBusinessOverrideForm } from "@/components/forms/lead-autoresponder-business-override-form";
import { LeadAutoresponderSettingsForm } from "@/components/forms/lead-autoresponder-settings-form";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LeadAutomationTemplateFormValues } from "@/features/autoresponder/schemas";
import { getLeadAutomationModuleState } from "@/features/autoresponder/service";
import {
  humanizeLeadAutomationRenderMode,
  humanizeLeadAutomationTemplateKind,
  readLeadAutomationTemplateMetadata
} from "@/features/autoresponder/template-metadata";
import { requireUser } from "@/lib/auth/service";
import { hasPermission } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils/format";

function normalizeAutomationChannel(channel: string | null | undefined) {
  return channel === "EMAIL" ? "EMAIL" : "YELP_THREAD";
}

function channelLabel(channel: string | null | undefined) {
  return channel === "EMAIL" ? "Yelp masked email" : "Yelp thread";
}

function getTemplateKindLabel(metadataJson: unknown) {
  const metadata = readLeadAutomationTemplateMetadata(metadataJson);
  return `${humanizeLeadAutomationTemplateKind(metadata.templateKind)} • ${humanizeLeadAutomationRenderMode(metadata.renderMode)}`;
}

function getTemplateKindValue(metadataJson: unknown): LeadAutomationTemplateFormValues["templateKind"] {
  return readLeadAutomationTemplateMetadata(metadataJson).templateKind;
}

function getTemplateRenderModeValue(metadataJson: unknown): LeadAutomationTemplateFormValues["renderMode"] {
  return readLeadAutomationTemplateMetadata(metadataJson).renderMode;
}

function getTemplateAiPromptValue(metadataJson: unknown) {
  return readLeadAutomationTemplateMetadata(metadataJson).aiPrompt ?? "";
}

export default async function AutoresponderPage({
  searchParams
}: {
  searchParams: Promise<{
    templateId?: string;
    ruleId?: string;
    overrideBusinessId?: string;
  }>;
}) {
  const user = await requireUser();

  if (!hasPermission(user.role.code, "settings:read")) {
    redirect("/dashboard");
  }

  const canManage = hasPermission(user.role.code, "settings:write");
  const params = await searchParams;
  const overview = await getLeadAutomationModuleState(user.tenantId);
  const selectedTemplate = params.templateId
    ? overview.templates.find((template) => template.id === params.templateId) ?? null
    : null;
  const selectedRule = params.ruleId ? overview.rules.find((rule) => rule.id === params.ruleId) ?? null : null;
  const selectedOverride = params.overrideBusinessId
    ? overview.businessOverrides.find((override) => override.businessId === params.overrideBusinessId) ?? null
    : null;
  const businessOptions = overview.options.businesses.map((business) => ({
    id: business.id,
    name: business.name,
    yelpBusinessId: business.encryptedYelpBusinessId ?? null
  }));
  const activeFollowUpCount = Number(overview.settings.followUp24hEnabled) + Number(overview.settings.followUp7dEnabled);

  return (
    <div>
      <PageHeader
        title="Autoresponder"
        description="Manage Yelp-thread automation, business scope, and follow-up health."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/audit">Open issue queue</Link>
          </Button>
        }
      />

      <Card className="mt-6 shadow-none">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle>Operating status</CardTitle>
              <CardDescription>Current live mode, business coverage, and delivery health.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={overview.moduleSummary.isEnabled ? "success" : "outline"}>
                {overview.moduleSummary.isEnabled ? "Live" : "Disabled"}
              </Badge>
              <Badge variant="outline">{channelLabel(overview.moduleSummary.defaultChannel)}</Badge>
              <Badge variant="outline">{overview.moduleSummary.conversationRolloutLabel}</Badge>
              <Badge variant="secondary">
                {activeFollowUpCount === 0 ? "Follow-ups off" : `${activeFollowUpCount} follow-up cadence${activeFollowUpCount === 1 ? "" : "s"} active`}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1 xl:border-r xl:border-border/70 xl:pr-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Status</div>
              <div className="text-xl font-semibold tracking-tight">{overview.moduleSummary.isEnabled ? "Live" : "Disabled"}</div>
              <div className="text-xs text-muted-foreground">{channelLabel(overview.moduleSummary.defaultChannel)}</div>
            </div>
            <div className="space-y-1 xl:border-r xl:border-border/70 xl:px-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Business scope</div>
              <div className="text-xl font-semibold tracking-tight">
                {overview.moduleSummary.scopeMode === "SELECTED_BUSINESSES"
                  ? overview.moduleSummary.scopedBusinessCount
                  : "All"}
              </div>
              <div className="text-xs text-muted-foreground">
                {overview.moduleSummary.scopeMode === "SELECTED_BUSINESSES"
                  ? "Businesses covered by tenant defaults"
                  : "Tenant defaults cover all businesses"}
              </div>
            </div>
            <div className="space-y-1 xl:border-r xl:border-border/70 xl:px-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Live content</div>
              <div className="text-xl font-semibold tracking-tight">{overview.moduleSummary.enabledTemplateCount}</div>
              <div className="text-xs text-muted-foreground">{overview.moduleSummary.enabledRuleCount} enabled rules</div>
            </div>
            <div className="space-y-1 xl:pl-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">AI assist</div>
              <div className="text-xl font-semibold tracking-tight">{overview.aiAssist.enabled ? "On" : "Off"}</div>
              <div className="text-xs text-muted-foreground">
                {overview.aiAssist.envConfigured ? overview.aiAssist.modelLabel : "OpenAI key not configured"}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-4">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Yelp thread delivery</span>
                <StatusChip status={overview.moduleSummary.deliveryAccessStatus} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Businesses ready</span>
                <span className="font-medium">{overview.moduleSummary.businessReadyCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Proof of send</span>
                <span className="font-medium">{overview.moduleSummary.businessLiveCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Need setup or attention</span>
                <span className="font-medium">
                  {overview.moduleSummary.businessNeedsSetupCount + overview.moduleSummary.businessIssueCount}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Successful sends</span>
                <span className="font-medium">{overview.moduleSummary.sentCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Pending due now</span>
                <span className="font-medium">{overview.moduleSummary.pendingDueCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Conversation review queue</span>
                <span className="font-medium">{overview.moduleSummary.conversationReviewOpenCount}</span>
              </div>
            </div>
            <div className="mt-4 text-xs text-muted-foreground">
              {overview.moduleSummary.deliveryAccessLabel}
              <span className="mx-2 text-border">•</span>
              {overview.moduleSummary.conversationGlobalPauseEnabled
                ? "Conversation automation paused tenant-wide."
                : overview.moduleSummary.lastSuccessfulAt
                  ? `Last successful send ${formatDateTime(overview.moduleSummary.lastSuccessfulAt)}`
                  : "No successful send recorded yet."}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 space-y-6">
        {canManage ? (
          <LeadAutoresponderSettingsForm
            defaultValues={overview.settings}
            smtpConfigured={overview.smtpConfigured}
            aiAssistConfigured={overview.aiAssist.envConfigured}
            availableModels={overview.aiAssist.availableModels}
            businesses={businessOptions}
          />
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Tenant defaults</CardTitle>
              <CardDescription>Operators can monitor the live policy here. Only admins can change it.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-2">
              <div className="rounded-xl bg-muted/10 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Primary channel</div>
                <div className="mt-2 font-medium">{overview.operatingMode.primaryChannel}</div>
                <div className="mt-1 text-xs text-muted-foreground">{overview.operatingMode.scopePolicy}</div>
              </div>
              <div className="rounded-xl bg-muted/10 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Fallback + AI</div>
                <div className="mt-2 font-medium">{overview.aiAssist.enabled ? "AI assist enabled" : "AI assist disabled"}</div>
                <div className="mt-1 text-xs text-muted-foreground">{overview.operatingMode.fallbackPolicy}</div>
              </div>
              <div className="rounded-xl bg-muted/10 p-4 md:col-span-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Conversation policy</div>
                <div className="mt-2 font-medium">{overview.operatingMode.conversationPolicy}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {overview.moduleSummary.conversationGlobalPauseEnabled
                    ? "Tenant pause is on. Saved conversation settings resume when the pause is lifted."
                    : overview.moduleSummary.conversationAutomationEnabled
                      ? overview.moduleSummary.conversationAllowedIntentLabels
                      : "Inbound customer messages stay human-only unless a business override enables conversation automation."}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Business delivery status</CardTitle>
            <CardDescription>Check which businesses are off, live, syncing, or blocked.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {overview.businessHealth.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No Yelp businesses connected yet" description="Connected businesses appear here once tenant defaults or overrides can cover them." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead>Yelp + sync</TableHead>
                    <TableHead>Automation</TableHead>
                    <TableHead>Conversation</TableHead>
                    <TableHead>Latest proof</TableHead>
                    <TableHead>Action needed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.businessHealth.map((business) => (
                    <TableRow key={business.businessId}>
                      <TableCell>
                        <div className="font-medium">{business.businessName}</div>
                        <div className="text-xs text-muted-foreground">{business.yelpBusinessId ?? "Yelp business ID missing"}</div>
                        <div className="mt-2">
                          <Badge variant={business.isEnabled ? "secondary" : "outline"}>{business.coverageLabel}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusChip status={business.yelpConnectionStatus} />
                          <StatusChip status={business.syncStatus} />
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {business.yelpConnectionLabel} • {business.syncLabel}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {business.leadCount} lead{business.leadCount === 1 ? "" : "s"}
                          {business.pendingSyncCount > 0 ? ` • ${business.pendingSyncCount} pending` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <StatusChip status={business.healthStatus} />
                          <span className="text-sm text-muted-foreground">{business.healthLabel}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {business.automationPostureLabel}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {business.followUpLabel} • AI {business.aiAssistEnabled ? "on" : "off"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusChip status={business.conversationStatus} />
                          <span className="text-sm text-muted-foreground">{business.conversationLabel}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{business.conversationDetail}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div>
                          Send: {business.lastSuccessfulAt ? formatDateTime(business.lastSuccessfulAt) : "none yet"}
                        </div>
                        <div className="text-xs">
                          Webhook: {business.lastWebhookReceivedAt ? formatDateTime(business.lastWebhookReceivedAt) : "none yet"}
                        </div>
                        <div className="text-xs">
                          Sync: {business.lastSyncAt ? formatDateTime(business.lastSyncAt) : "none yet"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[18rem] text-sm text-muted-foreground">
                        <div>{business.detail}</div>
                        <div className="mt-1 text-xs">{business.syncDetail}</div>
                        {business.healthStatus === "FAILED" || business.healthStatus === "UNRESOLVED" ? (
                          <div className="mt-1 text-xs">{business.yelpConnectionDetail}</div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Business overrides</CardTitle>
            <CardDescription>Use overrides only where a business should behave differently from the tenant default.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 p-0">
            {overview.businessOverrides.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No business overrides yet" description="Businesses without an override follow the current tenant coverage policy." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>AI</TableHead>
                    <TableHead>Updated</TableHead>
                    {canManage ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.businessOverrides.map((override) => (
                    <TableRow key={override.businessId}>
                      <TableCell>
                        <div className="font-medium">{override.businessName}</div>
                        <div className="text-xs text-muted-foreground">{override.yelpBusinessId ?? "Yelp business ID missing"}</div>
                      </TableCell>
                      <TableCell>
                        <div>{override.isEnabled ? channelLabel(override.defaultChannel) : "Disabled"}</div>
                        <div className="text-xs text-muted-foreground">
                          {override.followUp24hEnabled ? `24h after ${override.followUp24hDelayHours}h` : "24h off"} •{" "}
                          {override.followUp7dEnabled ? `week-later after ${override.followUp7dDelayDays}d` : "week-later off"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {override.conversationAutomationEnabled
                            ? `${override.conversationModeLabel} • ${override.conversationMaxAutomatedTurns} auto turns max`
                            : "Conversation automation off"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{override.aiAssistEnabled ? "AI assist on" : "AI assist off"}</div>
                        <div className="text-xs text-muted-foreground">
                          {override.aiModelLabel}
                          {override.conversationAutomationEnabled ? ` • ${override.conversationAllowedIntentLabels}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(override.updatedAt)}</TableCell>
                      {canManage ? (
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/autoresponder?overrideBusinessId=${override.businessId}`}>Edit</Link>
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {canManage ? (
              <div className="border-t border-border/70 p-6 pt-6">
                <LeadAutoresponderBusinessOverrideForm
                  aiAssistConfigured={overview.aiAssist.envConfigured}
                  availableModels={overview.aiAssist.availableModels}
                  businesses={businessOptions}
                  canDelete={Boolean(selectedOverride)}
                  initialValues={
                    selectedOverride
                      ? {
                          businessId: selectedOverride.businessId,
                          isEnabled: selectedOverride.isEnabled,
                          defaultChannel: normalizeAutomationChannel(selectedOverride.defaultChannel),
                          emailFallbackEnabled: selectedOverride.emailFallbackEnabled,
                          followUp24hEnabled: selectedOverride.followUp24hEnabled,
                          followUp24hDelayHours: selectedOverride.followUp24hDelayHours,
                          followUp7dEnabled: selectedOverride.followUp7dEnabled,
                          followUp7dDelayDays: selectedOverride.followUp7dDelayDays,
                          aiAssistEnabled: selectedOverride.aiAssistEnabled,
                          aiModel: selectedOverride.aiModel,
                          conversationAutomationEnabled: selectedOverride.conversationAutomationEnabled,
                          conversationMode: selectedOverride.conversationMode,
                          conversationAllowedIntents: selectedOverride.conversationAllowedIntents,
                          conversationMaxAutomatedTurns: selectedOverride.conversationMaxAutomatedTurns,
                          conversationReviewFallbackEnabled: selectedOverride.conversationReviewFallbackEnabled,
                          conversationEscalateToIssueQueue: selectedOverride.conversationEscalateToIssueQueue
                        }
                      : null
                  }
                  returnPath="/autoresponder"
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Templates</CardTitle>
            <CardDescription>Live copy for first responses and later follow-ups.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 p-0">
            {overview.templates.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No templates yet" description="Create a template before enabling a live rule." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.templates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell>
                        <div className="font-medium">{template.name}</div>
                        <div className="text-xs text-muted-foreground">{getTemplateKindLabel(template.metadataJson)}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{template.business?.name ?? "All businesses"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{channelLabel(template.channel)}</TableCell>
                      <TableCell>
                        <StatusChip status={template.isEnabled ? "ACTIVE" : "INACTIVE"} />
                      </TableCell>
                      {canManage ? (
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/autoresponder?templateId=${template.id}`}>Edit</Link>
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {canManage ? (
              <div className="border-t border-border/70 p-6 pt-6">
                <LeadAutomationTemplateForm
                  businesses={businessOptions}
                  canDelete={Boolean(selectedTemplate)}
                  initialValues={
                    selectedTemplate
                      ? {
                          name: selectedTemplate.name,
                          businessId: selectedTemplate.businessId ?? "",
                          channel: normalizeAutomationChannel(selectedTemplate.channel),
                          templateKind: getTemplateKindValue(selectedTemplate.metadataJson),
                          renderMode: getTemplateRenderModeValue(selectedTemplate.metadataJson),
                          aiPrompt: getTemplateAiPromptValue(selectedTemplate.metadataJson),
                          isEnabled: selectedTemplate.isEnabled,
                          subjectTemplate: selectedTemplate.subjectTemplate ?? "",
                          bodyTemplate: selectedTemplate.bodyTemplate
                        }
                      : null
                  }
                  templateId={selectedTemplate?.id ?? null}
                  returnPath="/autoresponder"
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Rules</CardTitle>
            <CardDescription>Choose which template is eligible for each cadence and scope.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 p-0">
            {overview.rules.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No rules yet" description="Nothing sends until a live rule matches." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <div className="font-medium">{rule.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {rule.cadenceLabel} • Priority {rule.priority} • {rule.template.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{rule.business?.name ?? "All businesses"}</div>
                        <div className="text-xs text-muted-foreground">
                          {rule.location?.name ?? "All locations"} • {rule.serviceCategory?.name ?? "All services"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[16rem] text-xs text-muted-foreground">{rule.workingHoursLabel}</TableCell>
                      <TableCell>
                        <StatusChip status={rule.isEnabled ? "ACTIVE" : "INACTIVE"} />
                      </TableCell>
                      {canManage ? (
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/autoresponder?ruleId=${rule.id}`}>Edit</Link>
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {canManage ? (
              <div className="border-t border-border/70 p-6 pt-6">
                {overview.templates.length === 0 ? (
                  <EmptyState title="Template required first" description="Create a template before adding a rule." />
                ) : (
                  <LeadAutomationRuleForm
                    canDelete={Boolean(selectedRule)}
                    initialValues={
                      selectedRule
                        ? {
                            name: selectedRule.name,
                            templateId: selectedRule.templateId,
                            businessId: selectedRule.businessId ?? "",
                            cadence: selectedRule.cadence,
                            channel: normalizeAutomationChannel(selectedRule.channel),
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
                    businesses={businessOptions}
                    locations={overview.options.locations}
                    ruleId={selectedRule?.id ?? null}
                    serviceCategories={overview.options.serviceCategories}
                    templates={overview.templates.map((template) => ({
                      id: template.id,
                      name: template.name,
                      isEnabled: template.isEnabled,
                      channel: normalizeAutomationChannel(template.channel),
                      businessId: template.businessId ?? null,
                      businessName: template.business?.name ?? null
                    }))}
                    returnPath="/autoresponder"
                  />
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Conversation operations</CardTitle>
            <CardDescription>Monitor bounded conversation automation, auto-replies, and handoffs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={overview.moduleSummary.conversationGlobalPauseEnabled ? "warning" : "secondary"}>
                {overview.moduleSummary.conversationRolloutLabel}
              </Badge>
              <Badge variant="outline">{overview.moduleSummary.conversationAllowedIntentLabels}</Badge>
            </div>
            <div className="text-sm text-muted-foreground">{overview.moduleSummary.conversationRolloutDescription}</div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl bg-muted/10 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Auto replies</div>
                <div className="mt-2 text-xl font-semibold tracking-tight">{overview.conversationMetrics.automatedReplyCount}</div>
                <div className="text-xs text-muted-foreground">{overview.conversationMetrics.replyAfterAutomationRate}% replied after automation</div>
              </div>
              <div className="rounded-xl bg-muted/10 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Review + handoff</div>
                <div className="mt-2 text-xl font-semibold tracking-tight">
                  {overview.conversationMetrics.reviewOnlyCount + overview.conversationMetrics.humanHandoffCount}
                </div>
                <div className="text-xs text-muted-foreground">
                  {overview.conversationMetrics.reviewOnlyCount} review-only • {overview.conversationMetrics.humanHandoffCount} handoff
                </div>
              </div>
              <div className="rounded-xl bg-muted/10 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Safety stops</div>
                <div className="mt-2 text-xl font-semibold tracking-tight">
                  {overview.conversationMetrics.lowConfidenceCount +
                    overview.conversationMetrics.maxTurnLimitCount +
                    overview.conversationMetrics.sendFailureCount}
                </div>
                <div className="text-xs text-muted-foreground">
                  Low confidence {overview.conversationMetrics.lowConfidenceCount} • Max turns {overview.conversationMetrics.maxTurnLimitCount}
                </div>
              </div>
              <div className="rounded-xl bg-muted/10 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Operator takeovers</div>
                <div className="mt-2 text-xl font-semibold tracking-tight">{overview.conversationMetrics.operatorTakeoverCount}</div>
                <div className="text-xs text-muted-foreground">
                  Pricing risk {overview.conversationMetrics.pricingRiskCount} • Availability risk {overview.conversationMetrics.availabilityRiskCount}
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-semibold">Review queue</div>
                  <div className="text-xs text-muted-foreground">Blocked or review-only turns stay here until an operator handles them.</div>
                </div>
                {overview.conversationReviewQueue.items.length === 0 ? (
                  <EmptyState title="No conversation reviews open" description="New blocked or review-only turns appear here until a person handles the thread." />
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-border/70">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>When</TableHead>
                          <TableHead>Lead</TableHead>
                          <TableHead>Decision</TableHead>
                          <TableHead>Why</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overview.conversationReviewQueue.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</TableCell>
                            <TableCell>
                              <div className="font-medium">{item.customerName ?? item.externalLeadId}</div>
                              <div className="text-xs text-muted-foreground">{item.businessName}</div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusChip status={item.decision} />
                                <Badge variant="outline">{item.intentLabel}</Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm text-muted-foreground">
                                {item.stopReasonLabel ?? item.errorSummary ?? "Waiting for operator review."}
                              </div>
                              {item.linkedIssue ? (
                                <div className="mt-1 text-xs text-muted-foreground">Linked issue: {item.linkedIssue.summary}</div>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button asChild size="sm" variant="ghost">
                                <Link href={`/leads/${item.leadId}`}>Review</Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-semibold">Recent activity</div>
                    <div className="text-xs text-muted-foreground">Latest sends, skips, failures, and AI usage.</div>
                  </div>
                  {overview.recentActivity.length === 0 ? (
                    <EmptyState title="No activity yet" description="Activity appears here after the first send, skip, failure, or AI action." />
                  ) : (
                    <div className="overflow-hidden rounded-2xl border border-border/70">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>When</TableHead>
                            <TableHead>Activity</TableHead>
                            <TableHead>Context</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {overview.recentActivity.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap items-center gap-2">
                                  <StatusChip status={item.status} />
                                  <span className="font-medium">{item.actionLabel}</span>
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">{item.detail}</div>
                              </TableCell>
                              <TableCell>
                                <div>{item.targetLabel}</div>
                                <div className="text-xs text-muted-foreground">{item.businessName} • {item.channelLabel}</div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-semibold">Linked failures</div>
                    <div className="text-xs text-muted-foreground">Open issue-queue items tied to autoresponder delivery or policy problems.</div>
                  </div>
                  {overview.openIssues.length === 0 ? (
                    <EmptyState title="No open failures" description="New failures appear here until they are resolved or ignored." />
                  ) : (
                    <div className="overflow-hidden rounded-2xl border border-border/70">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Severity</TableHead>
                            <TableHead>Issue</TableHead>
                            <TableHead>Last seen</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {overview.openIssues.map((issue) => (
                            <TableRow key={issue.id}>
                              <TableCell>
                                <StatusChip status={issue.severity} />
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">{issue.summary}</div>
                                <div className="text-xs text-muted-foreground">{issue.targetLabel}</div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{formatDateTime(issue.lastDetectedAt)}</TableCell>
                              <TableCell className="text-right">
                                <Button asChild size="sm" variant="ghost">
                                  <Link href={`/audit/issues/${issue.id}`}>Review</Link>
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Rolling {overview.conversationMetrics.windowDays}-day window. This is operational signal, not a BI report.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
