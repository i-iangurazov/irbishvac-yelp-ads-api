CREATE INDEX "ReportScheduleRun_tenantId_generationStatus_deliveryStatus_lastAttemptedAt_idx"
ON "ReportScheduleRun"("tenantId", "generationStatus", "deliveryStatus", "lastAttemptedAt");

CREATE INDEX "AuditEvent_tenantId_correlationId_createdAt_idx"
ON "AuditEvent"("tenantId", "correlationId", "createdAt");

CREATE INDEX "YelpLead_tenantId_latestInteractionAt_createdAtYelp_idx"
ON "YelpLead"("tenantId", "latestInteractionAt", "createdAtYelp");

CREATE INDEX "YelpWebhookEvent_tenantId_status_receivedAt_idx"
ON "YelpWebhookEvent"("tenantId", "status", "receivedAt");

CREATE INDEX "LeadAutomationAttempt_tenantId_status_dueAt_startedAt_idx"
ON "LeadAutomationAttempt"("tenantId", "status", "dueAt", "startedAt");

CREATE INDEX "OperatorIssue_tenantId_status_issueType_lastDetectedAt_idx"
ON "OperatorIssue"("tenantId", "status", "issueType", "lastDetectedAt");

CREATE INDEX "SyncRun_tenantId_type_status_createdAt_idx"
ON "SyncRun"("tenantId", "type", "status", "createdAt");
