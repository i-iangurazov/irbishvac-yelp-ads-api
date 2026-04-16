import "server-only";

import type { CredentialKind, SyncRunType } from "@prisma/client";

import { getProgramsIndex } from "@/features/ads-programs/service";
import { getBusinessesIndex } from "@/features/businesses/service";
import {
  countSyncErrors,
  getWebhookReconcileDrilldown,
  getLatestSuccessfulSyncRun,
  getOperationsCounts,
  listRecentLocations,
  listRecentServiceCategories,
  listRecentSyncRuns,
  listRecentWebhookEvents
} from "@/lib/db/operations-repository";
import { getWorkerJobOverview } from "@/lib/db/worker-jobs-repository";
import { listCredentialSets } from "@/lib/db/credentials-repository";
import { getReportingIndex } from "@/features/reporting/service";
import { getCredentialHealthViewModel } from "@/features/settings/view-models";
import { getCapabilityFlags } from "@/lib/yelp/runtime";

const leadSyncTypes: SyncRunType[] = ["YELP_LEADS_WEBHOOK", "YELP_LEADS_BACKFILL", "CRM_LEAD_ENRICHMENT"];
const reportingSyncTypes: SyncRunType[] = ["YELP_REPORTING_REQUEST", "YELP_REPORTING_POLL"];
const crmSyncTypes: SyncRunType[] = ["CRM_LEAD_ENRICHMENT", "LOCATION_MAPPING", "SERVICE_MAPPING"];

function getCapabilityMessage(enabled: boolean, enabledMessage: string, disabledMessage: string) {
  return enabled ? enabledMessage : disabledMessage;
}

function findCredential(kind: CredentialKind, credentials: Awaited<ReturnType<typeof listCredentialSets>>) {
  return credentials.find((credential) => credential.kind === kind) ?? null;
}

export async function getAdsWorkspaceOverview(tenantId: string) {
  const [businesses, programs, reports, capabilities] = await Promise.all([
    getBusinessesIndex(tenantId),
    getProgramsIndex(tenantId),
    getReportingIndex(tenantId),
    getCapabilityFlags(tenantId)
  ]);

  return {
    businesses,
    programs,
    reports,
    capabilities
  };
}

export async function getLeadsOverview(tenantId: string) {
  const [counts, recentWebhookEvents, recentSyncRuns, capabilities] = await Promise.all([
    getOperationsCounts(tenantId),
    listRecentWebhookEvents(tenantId, 8),
    listRecentSyncRuns(tenantId, 8, leadSyncTypes),
    getCapabilityFlags(tenantId)
  ]);

  return {
    counts,
    recentWebhookEvents,
    recentSyncRuns,
    capabilityStates: {
      yelp: {
        enabled: capabilities.hasLeadsApi,
        message: getCapabilityMessage(
          capabilities.hasLeadsApi,
          "Yelp lead activity is enabled. This data remains Yelp-native until a CRM mapping is attached.",
          "Leads ingestion stays hidden until Yelp lead access is enabled for this tenant."
        )
      },
      crm: {
        enabled: capabilities.hasCrmIntegration,
        message: getCapabilityMessage(
          capabilities.hasCrmIntegration,
          "CRM enrichment is enabled. Scheduled, in-progress, and completed states will remain CRM-owned.",
          "CRM enrichment is disabled, so internal job lifecycle states will remain unavailable."
        )
      }
    }
  };
}

export async function getLocationsOverview(tenantId: string) {
  const [counts, locations, capabilities] = await Promise.all([
    getOperationsCounts(tenantId),
    listRecentLocations(tenantId, 8),
    getCapabilityFlags(tenantId)
  ]);

  return {
    counts,
    locations,
    hasCrmIntegration: capabilities.hasCrmIntegration
  };
}

export async function getServiceCategoryOverview(tenantId: string) {
  const [counts, serviceCategories] = await Promise.all([
    getOperationsCounts(tenantId),
    listRecentServiceCategories(tenantId, 8)
  ]);

  return {
    counts,
    serviceCategories
  };
}

export async function getIntegrationsOverview(tenantId: string) {
  const [capabilities, credentials, leadSync, reportingSync, crmSync, leadErrors, reportingErrors, crmErrors] =
    await Promise.all([
      getCapabilityFlags(tenantId),
      listCredentialSets(tenantId),
      getLatestSuccessfulSyncRun(tenantId, leadSyncTypes),
      getLatestSuccessfulSyncRun(tenantId, reportingSyncTypes),
      getLatestSuccessfulSyncRun(tenantId, crmSyncTypes),
      countSyncErrors(tenantId, leadSyncTypes),
      countSyncErrors(tenantId, reportingSyncTypes),
      countSyncErrors(tenantId, crmSyncTypes)
    ]);

  const adsCredential = findCredential("ADS_BASIC_AUTH", credentials);
  const reportingCredential = findCredential("REPORTING_FUSION", credentials);
  const supportCredential = findCredential("BUSINESS_MATCH", credentials);
  const leadsCredential = findCredential("DATA_INGESTION", credentials);

  return {
    integrations: [
      {
        id: "ads",
        label: "Yelp Ads API",
        enabled: capabilities.hasAdsApi,
        detail: adsCredential
          ? getCredentialHealthViewModel(adsCredential).detail
          : "Credential health is managed in Admin Settings."
      },
      {
        id: "leads",
        label: "Yelp Leads API Webhooks",
        enabled: capabilities.hasLeadsApi,
        detail: leadsCredential
          ? getCredentialHealthViewModel(leadsCredential).detail
          : "Lead sync depends on Yelp lead enablement plus webhook validation and backfill wiring.",
        lastSuccessfulSyncAt: leadSync?.finishedAt ?? null,
        errorCount: leadErrors
      },
      {
        id: "partner-support",
        label: "Yelp OAuth / Business Access",
        enabled: capabilities.hasPartnerSupportApi,
        detail: supportCredential
          ? getCredentialHealthViewModel(supportCredential).detail
          : "Business-access helper capabilities stay disabled until Yelp partner support enables them."
      },
      {
        id: "reporting",
        label: "Yelp Reporting API",
        enabled: capabilities.hasReportingApi,
        detail: reportingCredential
          ? getCredentialHealthViewModel(reportingCredential).detail
          : "Reporting remains batch-oriented and delayed even when the API is enabled.",
        lastSuccessfulSyncAt: reportingSync?.finishedAt ?? null,
        errorCount: reportingErrors
      },
      {
        id: "crm",
        label: "CRM / ServiceTitan",
        enabled: capabilities.hasCrmIntegration,
        detail: capabilities.hasCrmIntegration
          ? "CRM is the source of truth for Scheduled, Job in Progress, and Completed lifecycle states."
          : "CRM enrichment is disabled. Yelp lead activity will render without downstream operational status.",
        lastSuccessfulSyncAt: crmSync?.finishedAt ?? null,
        errorCount: crmErrors
      }
    ],
    recentSyncRuns: await listRecentSyncRuns(tenantId, 8)
  };
}

export async function getAuditSyncOverview(tenantId: string) {
  return {
    recentSyncRuns: await listRecentSyncRuns(tenantId, 10)
  };
}

export async function getAuditWebhookOverview(tenantId: string) {
  return getWebhookReconcileDrilldown(tenantId);
}

export async function getAuditWorkerJobOverview(tenantId: string) {
  return getWorkerJobOverview(tenantId);
}
