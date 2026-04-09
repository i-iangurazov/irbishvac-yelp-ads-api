import type { ReactNode } from "react";

import Link from "next/link";

import { LeadAiSummaryPanel } from "@/components/forms/lead-ai-summary-panel";
import { LeadCrmMappingForm } from "@/components/forms/lead-crm-mapping-form";
import { LeadCrmStatusForm } from "@/components/forms/lead-crm-status-form";
import { LeadReplyForm } from "@/components/forms/lead-reply-form";
import { JsonViewer } from "@/components/shared/json-viewer";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getLeadDetail } from "@/features/leads/service";
import { requireUser } from "@/lib/auth/service";
import { formatDateTime, titleCase } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

type LeadDetail = Awaited<ReturnType<typeof getLeadDetail>>;

function channelLabel(channel: string | null) {
  if (channel === "YELP_THREAD") {
    return "Yelp thread";
  }

  if (channel === "EMAIL") {
    return "Yelp masked email";
  }

  if (channel === "PHONE") {
    return "Phone / SMS";
  }

  return "No outbound channel yet";
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getLeadTitle(detail: LeadDetail) {
  if (detail.lead.customerName && detail.lead.business?.name) {
    return `${detail.lead.customerName} · ${detail.lead.business.name}`;
  }

  if (detail.lead.customerName) {
    return detail.lead.customerName;
  }

  if (detail.lead.business?.name) {
    return `${detail.lead.business.name} lead`;
  }

  return "Lead workspace";
}

function getLeadDescription(detail: LeadDetail) {
  const parts = [
    detail.lead.externalLeadId ? `Lead ${detail.lead.externalLeadId}` : null,
    detail.lead.externalBusinessId ? `Yelp business ${detail.lead.externalBusinessId}` : null,
    detail.lead.createdAtYelp ? `Opened ${formatDateTime(detail.lead.createdAtYelp)}` : null
  ].filter(Boolean);

  return parts.join(" • ") || "Reply, review thread activity, and keep partner operations aligned.";
}

function getIntakeLabel(detail: LeadDetail) {
  if (!detail.latestIntakeSync) {
    return "No intake run recorded yet";
  }

  if (detail.latestIntakeSync.type === "YELP_LEADS_BACKFILL") {
    return "Imported by backfill";
  }

  return "Received from webhook";
}

function getNextFollowUpLabel(detail: LeadDetail) {
  if (!detail.nextFollowUp) {
    return "No follow-up queued";
  }

  return `${detail.nextFollowUp.cadence === "FOLLOW_UP_24H" ? "24-hour" : "Following-week"} follow-up • ${formatDateTime(detail.nextFollowUp.dueAt)}`;
}

function getAttentionItems(detail: LeadDetail) {
  const items = new Map<string, string>();

  if (detail.lead.replyState !== "REPLIED") {
    items.set("reply", "Lead still needs a confirmed reply path.");
  }

  if (detail.linkedIssues.length > 0) {
    items.set("issues", `${detail.linkedIssues.length} open operator issue${detail.linkedIssues.length === 1 ? "" : "s"} linked to this lead.`);
  }

  if (detail.processingIssues.length > 0) {
    items.set("processing", "Recent webhook processing had partial or failed intake.");
  }

  if (["FAILED", "CONFLICT", "ERROR", "STALE"].includes(detail.crm.health.status)) {
    items.set("crm-health", detail.crm.health.message);
  }

  if (detail.crm.mapping?.state === "UNRESOLVED") {
    items.set("mapping", "CRM mapping is still unresolved.");
  }

  if (detail.automationSummary.status === "FAILED") {
    items.set("automation", detail.automationSummary.message);
  }

  if (detail.nextFollowUp && detail.nextFollowUp.dueAt.getTime() <= Date.now()) {
    items.set("follow-up", `${detail.nextFollowUp.cadence === "FOLLOW_UP_24H" ? "24-hour" : "Following-week"} follow-up is due now.`);
  }

  return Array.from(items.values()).slice(0, 4);
}

function SummaryFact({
  label,
  value,
  subtle
}: {
  label: string;
  value: string | ReactNode;
  subtle?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className={`mt-2 text-sm ${subtle ? "text-muted-foreground" : "font-medium text-foreground"}`}>{value}</div>
    </div>
  );
}

export default async function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const user = await requireUser();
  const { leadId } = await params;
  const detail = await getLeadDetail(user.tenantId, leadId);
  const mapping = detail.crm.mapping;
  const latestIntake = detail.latestIntakeSync;
  const attentionItems = getAttentionItems(detail);

  return (
    <div className="space-y-6">
      <PageHeader
        title={getLeadTitle(detail)}
        description={getLeadDescription(detail)}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusChip status={detail.lead.replyState} />
            <StatusChip status={detail.automationSummary.status} />
            <StatusChip status={detail.crm.currentInternalStatus} />
            {detail.linkedIssues.length > 0 ? (
              <Badge variant="warning">
                {detail.linkedIssues.length} open issue{detail.linkedIssues.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>
        }
      />

      <Card>
        <CardContent className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{getIntakeLabel(detail)}</Badge>
              <Badge variant="outline">{detail.automationScope.scopeLabel}</Badge>
              <Badge variant="outline">{channelLabel(detail.replyComposer.latestOutboundChannel)}</Badge>
              {latestIntake?.status ? <StatusChip status={latestIntake.status} /> : <StatusChip status={detail.latestWebhookStatus} />}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <SummaryFact label="Mapped business" value={detail.lead.business ? <Link className="hover:underline" href={`/businesses/${detail.lead.business.id}`}>{detail.lead.business.name}</Link> : "Not mapped"} />
              <SummaryFact label="Customer" value={detail.lead.customerName ?? "Not provided"} />
              <SummaryFact label="Latest activity" value={detail.lead.latestInteractionAt ? formatDateTime(detail.lead.latestInteractionAt) : "No activity timestamp yet"} />
              <SummaryFact label="Current reply state" value={<StatusChip status={detail.lead.replyState} />} />
              <SummaryFact label="Initial response" value={<StatusChip status={detail.automationSummary.status} />} />
              <SummaryFact label="Next follow-up" value={getNextFollowUpLabel(detail)} subtle />
            </div>
          </div>

          <div className="rounded-3xl border border-border/70 bg-muted/10 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  {attentionItems.length > 0 ? "Needs attention now" : "No active blockers"}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {attentionItems.length > 0
                    ? "These are the first things to resolve before treating the lead as healthy."
                    : "Reply, mapping, automation, and recent intake all look clear."}
                </div>
              </div>
              <Badge variant={attentionItems.length > 0 ? "warning" : "success"}>
                {attentionItems.length > 0 ? `${attentionItems.length} items` : "Clear"}
              </Badge>
            </div>

            {attentionItems.length > 0 ? (
              <div className="mt-4 space-y-3">
                {attentionItems.map((item) => (
                  <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                Keep the reply moving in Yelp, and use partner operations only when mapping or lifecycle changes are needed.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Conversation and activity</CardTitle>
              <CardDescription>
                Keep the lead grounded in the Yelp thread first. Internal logs and automation stay available, but secondary.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="thread">
                <TabsList className="h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
                  <TabsTrigger className="rounded-full border border-border/80 px-3 py-1.5 data-[state=active]:border-transparent" value="thread">
                    Yelp thread
                  </TabsTrigger>
                  <TabsTrigger className="rounded-full border border-border/80 px-3 py-1.5 data-[state=active]:border-transparent" value="messages">
                    Replies and actions
                  </TabsTrigger>
                  <TabsTrigger className="rounded-full border border-border/80 px-3 py-1.5 data-[state=active]:border-transparent" value="automation">
                    Automation
                  </TabsTrigger>
                  <TabsTrigger className="rounded-full border border-border/80 px-3 py-1.5 data-[state=active]:border-transparent" value="partner">
                    Partner timeline
                  </TabsTrigger>
                </TabsList>

                <TabsContent className="mt-4 space-y-3" value="thread">
                  {detail.timeline.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 px-4 py-5 text-sm text-muted-foreground">
                      No normalized Yelp thread events have been stored yet.
                    </div>
                  ) : (
                    detail.timeline.map((event) => (
                      <div className="rounded-2xl border border-border/80 p-4" key={event.id}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="font-medium">{titleCase(event.eventType)}</div>
                            <div className="text-sm text-muted-foreground">
                              {event.actorType ? `${titleCase(event.actorType)} • ` : ""}
                              {event.occurredAt ? formatDateTime(event.occurredAt) : "Time unavailable"}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {event.isRead ? <Badge variant="outline">Read marker</Badge> : null}
                            {event.isReply ? <Badge variant="secondary">Reply marker</Badge> : null}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent className="mt-4 space-y-3" value="messages">
                  {detail.messageHistory.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 px-4 py-5 text-sm text-muted-foreground">
                      No local reply or message actions are recorded for this lead yet.
                    </div>
                  ) : (
                    detail.messageHistory.map((action) => (
                      <div className="rounded-2xl border border-border/80 p-4" key={action.id}>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusChip status={action.status} />
                              <Badge variant="outline">{action.channelLabel}</Badge>
                              <Badge variant={action.initiator === "AUTOMATION" ? "secondary" : "outline"}>
                                {action.initiatorLabel}
                              </Badge>
                            </div>
                            <div className="font-medium">{action.actionLabel}</div>
                            <div className="text-sm text-muted-foreground">
                              Started {formatDateTime(action.startedAt ?? action.createdAt)}
                              {action.completedAt ? ` • Completed ${formatDateTime(action.completedAt)}` : ""}
                            </div>
                            {action.automationRuleName || action.automationTemplateName ? (
                              <div className="text-xs text-muted-foreground">
                                Rule {action.automationRuleName ?? "Not selected"} • Template {action.automationTemplateName ?? "Not selected"}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {action.recipient ? <div className="mt-3 text-sm">Recipient: {action.recipient}</div> : null}
                        {action.deliveryNote ? <div className="mt-2 text-sm text-muted-foreground">{action.deliveryNote}</div> : null}
                        {action.renderedSubject ? <div className="mt-3 text-sm font-medium">{action.renderedSubject}</div> : null}
                        {action.renderedBody ? <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{action.renderedBody}</div> : null}
                        {action.errorSummary ? <div className="mt-3 text-sm text-destructive">{action.errorSummary}</div> : null}
                        {action.providerMessageId || action.providerStatus ? (
                          <div className="mt-3 text-xs text-muted-foreground">
                            Provider {action.providerStatus ?? "status unavailable"}
                            {action.providerMessageId ? ` • Message ${action.providerMessageId}` : ""}
                          </div>
                        ) : null}
                        {action.providerMetadataJson ? (
                          <div className="mt-3 rounded-2xl border border-dashed border-border/70 p-3">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              Provider metadata
                            </div>
                            <JsonViewer value={action.providerMetadataJson} />
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent className="mt-4 space-y-4" value="automation">
                  <div className="grid gap-3 md:grid-cols-3">
                    <SummaryFact label="Current status" value={<StatusChip status={detail.automationSummary.status} />} />
                    <SummaryFact label="Scope" value={detail.automationScope.scopeLabel} subtle />
                    <SummaryFact label="Next follow-up" value={getNextFollowUpLabel(detail)} subtle />
                  </div>

                  {detail.automationHistory.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 px-4 py-5 text-sm text-muted-foreground">
                      No autoresponder attempt is recorded for this lead yet.
                    </div>
                  ) : (
                    detail.automationHistory.map((attempt) => (
                      <div className="rounded-2xl border border-border/80 p-4" key={attempt.id}>
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusChip status={attempt.status} />
                            <Badge variant="secondary">{attempt.cadenceLabel}</Badge>
                            {attempt.deliveryChannelLabel ? <Badge variant="outline">{attempt.deliveryChannelLabel}</Badge> : null}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Triggered {formatDateTime(attempt.triggeredAt)}
                            {attempt.dueAt ? ` • Due ${formatDateTime(attempt.dueAt)}` : ""}
                            {attempt.completedAt ? ` • Completed ${formatDateTime(attempt.completedAt)}` : ""}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Rule {attempt.ruleName ?? "Not selected"} • Template {attempt.templateName ?? "Not selected"} • {attempt.scopeLabel}
                          </div>
                        </div>

                        {attempt.recipient ? <div className="mt-3 text-sm">Recipient: {attempt.recipient}</div> : null}
                        {attempt.skipReasonLabel ? <div className="mt-2 text-sm text-muted-foreground">Skip reason: {attempt.skipReasonLabel}</div> : null}
                        {attempt.errorSummary ? <div className="mt-2 text-sm text-destructive">{attempt.errorSummary}</div> : null}
                        {attempt.renderedSubject ? <div className="mt-3 text-sm font-medium">{attempt.renderedSubject}</div> : null}
                        {attempt.renderedBody ? <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{attempt.renderedBody}</div> : null}
                        {attempt.providerMessageId || attempt.providerStatus ? (
                          <div className="mt-3 text-xs text-muted-foreground">
                            Provider {attempt.providerStatus ?? "status unavailable"}
                            {attempt.providerMessageId ? ` • Message ${attempt.providerMessageId}` : ""}
                          </div>
                        ) : null}
                        {attempt.providerMetadataJson ? (
                          <div className="mt-3 rounded-2xl border border-dashed border-border/70 p-3">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              Provider metadata
                            </div>
                            <JsonViewer value={attempt.providerMetadataJson} />
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent className="mt-4 space-y-3" value="partner">
                  {detail.crm.statusTimeline.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 px-4 py-5 text-sm text-muted-foreground">
                      No partner lifecycle statuses are recorded yet.
                    </div>
                  ) : (
                    detail.crm.statusTimeline.map((event) => (
                      <div className="rounded-2xl border border-border/80 p-4" key={event.id}>
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusChip status={event.status} />
                            <Badge variant={event.sourceSystem === "CRM" ? "outline" : "secondary"}>
                              {event.sourceSystem === "CRM" ? "CRM" : "Internal"}
                            </Badge>
                            {asRecord(event.payloadJson)?.connector === "ServiceTitan" ? (
                              <Badge variant="secondary">ServiceTitan</Badge>
                            ) : null}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {formatDateTime(event.occurredAt)}
                            {event.substatus ? ` • ${event.substatus}` : ""}
                          </div>
                          {asRecord(event.payloadJson)?.connector === "ServiceTitan" ? (
                            <div className="text-xs text-muted-foreground">
                              Connector-derived lifecycle update from the mapped ServiceTitan record.
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Partner operations</CardTitle>
              <CardDescription>Update CRM mapping and partner lifecycle without mixing them into Yelp-native thread history.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/80 bg-muted/10 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={mapping?.state ?? "UNRESOLVED"} />
                  <StatusChip status={detail.crm.currentInternalStatus} />
                  <StatusChip status={detail.crm.health.status} />
                </div>
                <div className="mt-3 text-sm font-medium">{detail.crm.mappingReference}</div>
                <div className="mt-1 text-sm text-muted-foreground">{detail.crm.health.message}</div>
                {mapping?.matchedAt ? (
                  <div className="mt-2 text-xs text-muted-foreground">Matched {formatDateTime(mapping.matchedAt)}</div>
                ) : null}
              </div>

              <Accordion defaultValue={["mapping"]} type="multiple">
                <AccordionItem value="mapping">
                  <AccordionTrigger className="text-base font-semibold hover:no-underline">
                    Mapping and CRM IDs
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <LeadCrmMappingForm
                      defaultValues={{
                        state: mapping?.state === "MATCHED" ? "MANUAL_OVERRIDE" : mapping?.state ?? "UNRESOLVED",
                        externalCrmLeadId: mapping?.externalCrmLeadId ?? "",
                        externalOpportunityId: mapping?.externalOpportunityId ?? "",
                        externalJobId: mapping?.externalJobId ?? "",
                        issueSummary: mapping?.issueSummary ?? ""
                      }}
                      leadId={detail.lead.id}
                    />
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="lifecycle">
                  <AccordionTrigger className="text-base font-semibold hover:no-underline">
                    Add partner lifecycle update
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <LeadCrmStatusForm disabled={!detail.crm.mappingResolved} leadId={detail.lead.id} />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Technical details</CardTitle>
              <CardDescription>Use this only when intake, sync, or payload evidence needs review.</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion className="space-y-1" type="multiple">
                <AccordionItem value="deliveries">
                  <AccordionTrigger className="text-base font-semibold hover:no-underline">
                    Webhook deliveries
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    {detail.lead.webhookEvents.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 px-4 py-5 text-sm text-muted-foreground">
                        No raw webhook deliveries are linked to this lead. It may have entered through manual backfill.
                      </div>
                    ) : (
                      detail.lead.webhookEvents.map((event) => (
                        <div className="rounded-2xl border border-border/80 p-4" key={event.id}>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="font-medium">{event.topic}</div>
                              <div className="text-sm text-muted-foreground">
                                Received {formatDateTime(event.receivedAt)}
                                {event.deliveryId ? ` • ${event.deliveryId}` : ""}
                              </div>
                            </div>
                            <StatusChip status={event.status} />
                          </div>
                          {event.syncRun?.errors[0] ? (
                            <div className="mt-3 text-sm text-muted-foreground">{event.syncRun.errors[0].message}</div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="processing">
                  <AccordionTrigger className="text-base font-semibold hover:no-underline">
                    Intake and processing issues
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    {detail.processingIssues.length === 0 && detail.crm.issues.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 px-4 py-5 text-sm text-muted-foreground">
                        No intake or CRM issues are currently recorded for this lead.
                      </div>
                    ) : (
                      <>
                        {detail.crm.issues.map((issue) => (
                          <div className="rounded-2xl border border-border/80 bg-muted/10 p-4" key={issue.code}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium">CRM enrichment</div>
                              <StatusChip status={issue.code === "FAILED_SYNC" ? "FAILED" : issue.code} />
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">{issue.message}</div>
                          </div>
                        ))}
                        {detail.processingIssues.map((issue) => (
                          <div className="rounded-2xl border border-border/80 bg-muted/10 p-4" key={issue.id}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium">{formatDateTime(issue.receivedAt)}</div>
                              <StatusChip status={issue.status} />
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">
                              {issue.syncRun?.errors[0]?.message ?? "The webhook failed during processing."}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="snapshots">
                  <AccordionTrigger className="text-base font-semibold hover:no-underline">
                    Snapshots and payload debug
                  </AccordionTrigger>
                  <AccordionContent className="space-y-5">
                    {mapping?.rawSnapshotJson ? (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Latest CRM snapshot
                        </div>
                        <JsonViewer value={mapping.rawSnapshotJson} />
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Latest Yelp snapshot
                      </div>
                      <JsonViewer value={detail.lead.rawSnapshotJson} />
                    </div>

                    {detail.lead.webhookEvents[0] ? (
                      <>
                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Latest delivery payload
                          </div>
                          <JsonViewer value={detail.lead.webhookEvents[0].payloadJson} />
                        </div>
                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Latest delivery headers
                          </div>
                          <JsonViewer value={detail.lead.webhookEvents[0].headersJson} />
                        </div>
                        {detail.lead.webhookEvents[0].errorJson ? (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              Latest delivery error
                            </div>
                            <JsonViewer value={detail.lead.webhookEvents[0].errorJson} />
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="boundaries">
                  <AccordionTrigger className="text-base font-semibold hover:no-underline">
                    Source boundaries
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <div className="rounded-2xl border border-border/80 p-4">
                      <div className="flex items-center gap-2">
                        <Badge>Yelp-native</Badge>
                        <span className="font-medium">Thread events, lead IDs, read markers</span>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">{detail.sourceBoundaries.yelp}</div>
                    </div>
                    <div className="rounded-2xl border border-border/80 p-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Partner lifecycle</Badge>
                        <span className="font-medium">CRM IDs, mapping, lifecycle statuses</span>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">{detail.sourceBoundaries.crm}</div>
                    </div>
                    <div className="rounded-2xl border border-border/80 p-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Local</Badge>
                        <span className="font-medium">Webhook processing and fallback delivery</span>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">{detail.sourceBoundaries.local}</div>
                    </div>
                    <div className="rounded-2xl border border-border/80 p-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Automation</Badge>
                        <span className="font-medium">Rules, rendered messages, local attempts</span>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">{detail.sourceBoundaries.automation}</div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Reply</CardTitle>
              <CardDescription>Keep the response inside Yelp first. Use fallback channels only when the real follow-up happened elsewhere.</CardDescription>
            </CardHeader>
            <CardContent>
              <LeadReplyForm
                leadId={detail.lead.id}
                defaultChannel={detail.replyComposer.defaultChannel}
                canUseYelpThread={detail.replyComposer.canUseYelpThread}
                canUseEmail={detail.replyComposer.canUseEmail}
                maskedEmail={detail.replyComposer.maskedEmail}
                canMarkAsRead={detail.replyComposer.canMarkAsRead}
                latestOutboundChannel={detail.replyComposer.latestOutboundChannel}
                canMarkAsReplied={detail.replyComposer.canMarkAsReplied}
                canGenerateAiDrafts={detail.replyComposer.canGenerateAiDrafts}
              />
            </CardContent>
          </Card>

          <LeadAiSummaryPanel
            leadId={detail.lead.id}
            canGenerate={detail.aiAssist.envConfigured && detail.aiAssist.enabled}
            modelLabel={detail.aiAssist.envConfigured ? detail.aiAssist.modelLabel : "Model unavailable"}
          />

          <Card>
            <CardHeader>
              <CardTitle>Operations</CardTitle>
              <CardDescription>Quick internal context for mapping, lifecycle, and open lead-level issues.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                <SummaryFact label="CRM mapping" value={<StatusChip status={mapping?.state ?? "UNRESOLVED"} />} />
                <SummaryFact label="Partner lifecycle" value={<StatusChip status={detail.crm.currentInternalStatus} />} />
                <SummaryFact label="Partner sync health" value={detail.crm.health.message} subtle />
                <SummaryFact label="Masked email" value={detail.replyComposer.maskedEmail ?? "Not available"} subtle />
              </div>

              <div className="border-t border-border/70 pt-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">Open lead issues</div>
                  <Badge variant={detail.linkedIssues.length > 0 ? "warning" : "outline"}>
                    {detail.linkedIssues.length}
                  </Badge>
                </div>

                {detail.linkedIssues.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 px-4 py-5 text-sm text-muted-foreground">
                    No open operator issues are linked to this lead.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {detail.linkedIssues.map((issue) => (
                      <div className="rounded-2xl border border-border/80 p-4" key={issue.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusChip status={issue.severity} />
                              <span className="text-sm font-medium">
                                {titleCase(issue.issueType.replaceAll("_", " ").toLowerCase())}
                              </span>
                            </div>
                            <div className="text-sm text-muted-foreground">{issue.summary}</div>
                            <div className="text-xs text-muted-foreground">
                              Last seen {formatDateTime(issue.lastDetectedAt)}
                            </div>
                          </div>
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/audit/issues/${issue.id}`}>Open</Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
