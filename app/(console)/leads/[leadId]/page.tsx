import Link from "next/link";

import { LeadAiSummaryPanel } from "@/components/forms/lead-ai-summary-panel";
import { LeadCrmMappingForm } from "@/components/forms/lead-crm-mapping-form";
import { LeadCrmStatusForm } from "@/components/forms/lead-crm-status-form";
import { LeadReplyForm } from "@/components/forms/lead-reply-form";
import { JsonViewer } from "@/components/shared/json-viewer";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLeadDetail } from "@/features/leads/service";
import { requireUser } from "@/lib/auth/service";
import { formatDateTime, titleCase } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

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

export default async function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const user = await requireUser();
  const { leadId } = await params;
  const detail = await getLeadDetail(user.tenantId, leadId);
  const mapping = detail.crm.mapping;
  const latestIntake = detail.latestIntakeSync;

  return (
    <div>
      <PageHeader
        title={detail.lead.externalLeadId}
        description="Yelp thread history, partner lifecycle status, and reply delivery diagnostics for this lead."
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge>Yelp-native</Badge>
            <Badge variant="secondary">Partner lifecycle</Badge>
            <Badge variant="secondary">Local processing</Badge>
            <Badge variant="outline">Automation</Badge>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Lead summary</CardTitle>
              <CardDescription>Core Yelp metadata plus the latest internal mapping and lifecycle state.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <div className="text-muted-foreground">Mapped business</div>
                {detail.lead.business ? (
                  <Link className="font-medium hover:underline" href={`/businesses/${detail.lead.business.id}`}>
                    {detail.lead.business.name}
                  </Link>
                ) : (
                  <div>Not mapped</div>
                )}
              </div>
              <div>
                <div className="text-muted-foreground">Yelp business ID</div>
                <div>{detail.lead.externalBusinessId ?? "Not available"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Customer</div>
                <div>{detail.lead.customerName ?? "Not provided"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Reply / read</div>
                <StatusChip status={detail.lead.replyState} />
              </div>
              <div>
                <div className="text-muted-foreground">Created on Yelp</div>
                <div>{formatDateTime(detail.lead.createdAtYelp)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Latest activity</div>
                <div>{detail.lead.latestInteractionAt ? formatDateTime(detail.lead.latestInteractionAt) : "Not available"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Conversation ID</div>
                <div>{detail.lead.externalConversationId ?? "Not available"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Latest ingestion</div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={latestIntake?.status ?? detail.latestWebhookStatus} />
                  {latestIntake?.type === "YELP_LEADS_BACKFILL" ? <Badge variant="outline">Imported</Badge> : null}
                  {latestIntake?.type === "YELP_LEADS_WEBHOOK" ? <Badge variant="outline">Webhook</Badge> : null}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">CRM mapping</div>
                <StatusChip status={detail.crm.mapping?.state ?? "UNRESOLVED"} />
              </div>
              <div>
                <div className="text-muted-foreground">Partner lifecycle</div>
                <StatusChip status={detail.crm.currentInternalStatus} />
              </div>
              <div>
                <div className="text-muted-foreground">Partner sync health</div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={detail.crm.health.status} />
                  <span className="text-sm text-muted-foreground">{detail.crm.health.message}</span>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">First response</div>
                <StatusChip status={detail.automationSummary.status} />
              </div>
              <div>
                <div className="text-muted-foreground">Automation note</div>
                <div>{detail.automationSummary.message}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Automation scope</div>
                <div>
                  {detail.automationScope.scopeLabel}
                  {detail.automationScope.followUp24hEnabled || detail.automationScope.followUp7dEnabled ? (
                    <span className="text-muted-foreground">
                      {" "}
                      • {detail.automationScope.followUp24hEnabled ? `24h ${detail.automationScope.followUp24hDelayHours}h` : "24h off"} •{" "}
                      {detail.automationScope.followUp7dEnabled ? `week-later ${detail.automationScope.followUp7dDelayDays}d` : "week-later off"}
                    </span>
                  ) : null}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Next follow-up due</div>
                <div>
                  {detail.nextFollowUp
                    ? `${detail.nextFollowUp.cadence === "FOLLOW_UP_24H" ? "24-hour follow-up" : "Following-week follow-up"} • ${formatDateTime(detail.nextFollowUp.dueAt)}`
                    : "No pending follow-up"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Latest outbound channel</div>
                <div>{channelLabel(detail.replyComposer.latestOutboundChannel)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Yelp masked email</div>
                <div>{detail.replyComposer.maskedEmail ?? "Not available"}</div>
              </div>
              {latestIntake ? (
                <>
                  <div>
                    <div className="text-muted-foreground">Ingestion started</div>
                    <div>{formatDateTime(latestIntake.startedAt)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Ingestion note</div>
                    <div>{latestIntake.errorSummary ?? (latestIntake.type === "YELP_LEADS_BACKFILL" ? "Imported from the Yelp lead_ids backfill flow." : "Received from Yelp webhook delivery.")}</div>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Event timeline</CardTitle>
              <CardDescription>Chronological Yelp-native thread events fetched from Yelp, including any replies posted into the Yelp conversation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.timeline.length === 0 ? (
                <div className="text-sm text-muted-foreground">No normalized Yelp events were stored for this lead yet.</div>
              ) : (
                detail.timeline.map((event) => (
                  <div className="rounded-xl border border-border/80 p-4" key={event.id}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Partner lifecycle timeline</CardTitle>
              <CardDescription>Partner lifecycle statuses mapped after Yelp intake. These are not official Yelp states.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.crm.statusTimeline.length === 0 ? (
                <div className="text-sm text-muted-foreground">No partner lifecycle statuses were recorded for this lead yet.</div>
              ) : (
                detail.crm.statusTimeline.map((event) => (
                  <div className="rounded-xl border border-border/80 p-4" key={event.id}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusChip status={event.status} />
                          <Badge variant={event.sourceSystem === "CRM" ? "outline" : "secondary"}>
                            {event.sourceSystem === "CRM" ? "CRM" : "Internal"}
                          </Badge>
                          {asRecord(event.payloadJson)?.connector === "ServiceTitan" ? (
                            <Badge variant="secondary">ServiceTitan</Badge>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          {formatDateTime(event.occurredAt)}
                          {event.substatus ? ` • ${event.substatus}` : ""}
                        </div>
                        {asRecord(event.payloadJson)?.connector === "ServiceTitan" ? (
                          <div className="mt-2 text-xs text-muted-foreground">
                            Connector-derived lifecycle update from the mapped ServiceTitan record.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Webhook deliveries</CardTitle>
              <CardDescription>Raw deliveries received by this console for the lead.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.lead.webhookEvents.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No raw webhook deliveries were linked to this lead. It may have entered the console through the manual Yelp import flow instead.
                </div>
              ) : (
                detail.lead.webhookEvents.map((event) => (
                  <div className="rounded-xl border border-border/80 p-4" key={event.id}>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-medium">{event.topic}</div>
                        <div className="text-sm text-muted-foreground">
                          Received {formatDateTime(event.receivedAt)} {event.deliveryId ? `• ${event.deliveryId}` : ""}
                        </div>
                      </div>
                      <StatusChip status={event.status} />
                    </div>
                    {event.syncRun?.errors[0] ? (
                      <div className="mt-3 text-xs text-muted-foreground">{event.syncRun.errors[0].message}</div>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <LeadAiSummaryPanel
            leadId={detail.lead.id}
            canGenerate={detail.aiAssist.envConfigured && detail.aiAssist.enabled}
            modelLabel={detail.aiAssist.envConfigured ? detail.aiAssist.modelLabel : "Model unavailable"}
          />

          <Card>
            <CardHeader>
              <CardTitle>Open operational issues</CardTitle>
              <CardDescription>Queue items currently linked to this lead across intake, partner sync, automation, or stale follow-through.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.linkedIssues.length === 0 ? (
                <div className="text-sm text-muted-foreground">No open operator issues are linked to this lead right now.</div>
              ) : (
                detail.linkedIssues.map((issue) => (
                  <div className="rounded-xl border border-border/80 p-4" key={issue.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusChip status={issue.severity} />
                          <span className="text-sm font-medium">{titleCase(issue.issueType.replaceAll("_", " ").toLowerCase())}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{issue.summary}</div>
                        <div className="text-xs text-muted-foreground">Last seen {formatDateTime(issue.lastDetectedAt)}</div>
                      </div>
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/audit/issues/${issue.id}`}>Open issue</Link>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reply</CardTitle>
              <CardDescription>Prefer the Yelp thread. Use Yelp masked-email fallback or an outside-reply marker only when the real follow-up happened off-thread.</CardDescription>
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

          <Card>
            <CardHeader>
              <CardTitle>Reply and message actions</CardTitle>
              <CardDescription>Local log of operator and automation actions: Yelp-thread posts, Yelp masked-email fallback, read markers, and outside-Yelp reply markers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.messageHistory.length === 0 ? (
                <div className="text-sm text-muted-foreground">No local reply or message actions were recorded for this lead yet.</div>
              ) : (
                detail.messageHistory.map((action) => (
                  <div className="rounded-xl border border-border/80 p-4" key={action.id}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusChip status={action.status} />
                          <Badge variant="outline">{action.channelLabel}</Badge>
                          <Badge variant={action.initiator === "AUTOMATION" ? "secondary" : "outline"}>
                            {action.initiatorLabel}
                          </Badge>
                        </div>
                        <div className="mt-2 font-medium">{action.actionLabel}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          Started {formatDateTime(action.startedAt ?? action.createdAt)}
                          {action.completedAt ? ` • Completed ${formatDateTime(action.completedAt)}` : ""}
                        </div>
                        {action.automationRuleName || action.automationTemplateName ? (
                          <div className="mt-2 text-xs text-muted-foreground">
                            Rule {action.automationRuleName ?? "Not selected"} • Template {action.automationTemplateName ?? "Not selected"}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {action.recipient ? <div className="mt-3 text-sm">Recipient: {action.recipient}</div> : null}
                    {action.deliveryNote ? (
                      <div className="mt-3 text-sm text-muted-foreground">{action.deliveryNote}</div>
                    ) : null}
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
                      <div className="mt-3">
                        <JsonViewer value={action.providerMetadataJson} />
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Automation history</CardTitle>
              <CardDescription>Internal automation decisions and outcomes across the initial response and later follow-ups. Automated replies are labeled before they post in Yelp.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.automationHistory.length === 0 ? (
                <div className="text-sm text-muted-foreground">No autoresponder attempt was recorded for this lead yet.</div>
              ) : (
                detail.automationHistory.map((attempt) => (
                  <div className="rounded-xl border border-border/80 p-4" key={attempt.id}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusChip status={attempt.status} />
                          <Badge variant="secondary">{attempt.cadenceLabel}</Badge>
                          {attempt.deliveryChannelLabel ? <Badge variant="outline">{attempt.deliveryChannelLabel}</Badge> : null}
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          Triggered {formatDateTime(attempt.triggeredAt)}
                          {attempt.dueAt ? ` • Due ${formatDateTime(attempt.dueAt)}` : ""}
                          {attempt.completedAt ? ` • Completed ${formatDateTime(attempt.completedAt)}` : ""}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Rule {attempt.ruleName ?? "Not selected"} • Template {attempt.templateName ?? "Not selected"} • {attempt.scopeLabel}
                        </div>
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
                      <div className="mt-3">
                        <JsonViewer value={attempt.providerMetadataJson} />
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>CRM mapping</CardTitle>
              <CardDescription>Current internal link state for this Yelp lead.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2">
                  <StatusChip status={mapping?.state ?? "UNRESOLVED"} />
                  <span className="font-medium">{detail.crm.mappingReference}</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {mapping ? (
                    <>
                      Source {mapping.sourceSystem === "CRM" ? "CRM" : "Internal"}.
                      {mapping.location ? ` Location ${mapping.location.name}.` : ""}
                      {mapping.matchMethod ? ` Match method ${titleCase(mapping.matchMethod.replaceAll("_", " "))}.` : ""}
                    </>
                  ) : (
                    "No CRM entity is linked to this Yelp lead yet."
                  )}
                </div>
                {mapping?.issueSummary ? <div className="mt-2 text-xs text-muted-foreground">{mapping.issueSummary}</div> : null}
                {mapping?.matchedAt ? <div className="mt-2 text-xs text-muted-foreground">Matched {formatDateTime(mapping.matchedAt)}</div> : null}
                {mapping?.lastSyncedAt ? <div className="text-xs text-muted-foreground">Last synced {formatDateTime(mapping.lastSyncedAt)}</div> : null}
              </div>

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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Partner lifecycle update</CardTitle>
              <CardDescription>Add partner lifecycle milestones without changing the Yelp-native thread history.</CardDescription>
            </CardHeader>
            <CardContent>
              <LeadCrmStatusForm disabled={!detail.crm.mappingResolved} leadId={detail.lead.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Source boundaries</CardTitle>
              <CardDescription>Keep Yelp-native activity, partner lifecycle records, and local processing logs separate.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2">
                  <Badge>Yelp-native</Badge>
                  <span className="font-medium">Lead identifiers, Yelp thread events, reply and read markers</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">{detail.sourceBoundaries.yelp}</div>
              </div>
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Partner lifecycle</Badge>
                  <span className="font-medium">Mapping state, CRM IDs, and partner lifecycle statuses</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">{detail.sourceBoundaries.crm}</div>
              </div>
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Local</Badge>
                  <span className="font-medium">Webhook history, fallback delivery, outside-Yelp reply markers, and sync failures</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">{detail.sourceBoundaries.local}</div>
              </div>
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Automation</Badge>
                  <span className="font-medium">First-response rules, rendered messages, and local delivery attempts</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">{detail.sourceBoundaries.automation}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Processing and CRM issues</CardTitle>
              <CardDescription>Shows whether intake or downstream enrichment needs operator review.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.processingIssues.length === 0 && detail.crm.issues.length === 0 ? (
                <div className="text-sm text-muted-foreground">No intake or CRM mapping issues are currently recorded for this lead.</div>
              ) : (
                <>
                  {detail.crm.issues.map((issue) => (
                    <div className="rounded-xl border border-border/80 bg-muted/10 p-4" key={issue.code}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium">CRM enrichment</div>
                        <StatusChip status={issue.code === "FAILED_SYNC" ? "FAILED" : issue.code} />
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">{issue.message}</div>
                    </div>
                  ))}
                  {detail.processingIssues.map((issue) => (
                    <div className="rounded-xl border border-border/80 bg-muted/10 p-4" key={issue.id}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium">{formatDateTime(issue.receivedAt)}</div>
                        <StatusChip status={issue.status} />
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {issue.syncRun?.errors[0]?.message ?? "The webhook failed during processing."}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          {mapping?.rawSnapshotJson ? (
            <Card>
              <CardHeader>
                <CardTitle>Latest CRM snapshot</CardTitle>
                <CardDescription>The last internal mapping payload stored for this lead.</CardDescription>
              </CardHeader>
              <CardContent>
                <JsonViewer value={mapping.rawSnapshotJson} />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Latest Yelp snapshot</CardTitle>
              <CardDescription>The last lead payload saved after fetching from Yelp.</CardDescription>
            </CardHeader>
            <CardContent>
              <JsonViewer value={detail.lead.rawSnapshotJson} />
            </CardContent>
          </Card>

          {detail.lead.webhookEvents[0] ? (
            <Card>
              <CardHeader>
                <CardTitle>Latest delivery debug</CardTitle>
                <CardDescription>Raw webhook payload, headers, and processing error details for the most recent delivery.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Payload</div>
                  <JsonViewer value={detail.lead.webhookEvents[0].payloadJson} />
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Headers</div>
                  <JsonViewer value={detail.lead.webhookEvents[0].headersJson} />
                </div>
                {detail.lead.webhookEvents[0].errorJson ? (
                  <div>
                    <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Error</div>
                    <JsonViewer value={detail.lead.webhookEvents[0].errorJson} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
