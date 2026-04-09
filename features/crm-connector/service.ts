import "server-only";

import { randomUUID } from "node:crypto";

import { getServiceTitanLifecycleSyncOverview } from "@/features/crm-connector/lifecycle-service";
import { getServiceTitanLifecycleSyncLabel } from "@/features/crm-connector/lifecycle-normalize";
import { normalizeCapabilityFlags, type CapabilityFlags } from "@/features/settings/capabilities";
import { getCredentialHealthViewModel } from "@/features/settings/view-models";
import {
  businessLocationAssignmentSchema,
  locationConnectorMappingSchema,
  serviceConnectorMappingSchema,
  serviceTitanConnectorFormSchema,
  serviceTitanReferenceSyncSchema
} from "@/features/crm-connector/schemas";
import { refreshOperatorIssues } from "@/features/issues/service";
import { operatorIssueTypeLabels } from "@/features/issues/normalize";
import { recordAuditEvent } from "@/features/audit/service";
import { getCredentialSet, updateCredentialTestResult, upsertCredentialSet } from "@/lib/db/credentials-repository";
import {
  createConnectorSyncError,
  createConnectorSyncRun,
  getConnectorInventoryCounts,
  listConnectorBusinesses,
  listConnectorLocations,
  listConnectorServiceCategories,
  listOpenConnectorIssues,
  listRecentConnectorSyncRuns,
  updateBusinessLocationAssignment,
  updateLocationConnectorReference,
  updateServiceCategoryConnectorCodes,
  updateConnectorSyncRun
} from "@/lib/db/crm-connector-repository";
import { toJsonValue } from "@/lib/db/json";
import { getSystemSetting, upsertSystemSetting } from "@/lib/db/settings-repository";
import { encryptSecret } from "@/lib/utils/crypto";
import { logError } from "@/lib/utils/logging";
import { normalizeUnknownError, YelpValidationError } from "@/lib/yelp/errors";
import { getCapabilityFlags } from "@/lib/yelp/runtime";
import { ServiceTitanClient, normalizeServiceTitanError } from "@/lib/servicetitan/client";
import {
  getDefaultServiceTitanUrls,
  getServiceTitanCredentialConfig,
  type ServiceTitanEnvironment
} from "@/lib/servicetitan/runtime";

const serviceTitanCatalogSettingKey = "crmConnector.serviceTitan.catalog";

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getSyncAction(value: unknown) {
  const record = asRecord(value);
  return typeof record?.action === "string" ? record.action : null;
}

type ServiceTitanCatalogRow = {
  id: string;
  name: string;
  active: boolean;
  code?: string | null;
};

type ServiceTitanCatalogState = {
  environment: ServiceTitanEnvironment;
  syncedAt: string | null;
  businessUnits: {
    syncedAt: string | null;
    totalCount: number;
    hasMore: boolean;
    rows: ServiceTitanCatalogRow[];
  };
  categories: {
    syncedAt: string | null;
    totalCount: number;
    hasMore: boolean;
    rows: ServiceTitanCatalogRow[];
  };
};

function getEmptyCatalog(environment: ServiceTitanEnvironment): ServiceTitanCatalogState {
  return {
    environment,
    syncedAt: null,
    businessUnits: {
      syncedAt: null,
      totalCount: 0,
      hasMore: false,
      rows: []
    },
    categories: {
      syncedAt: null,
      totalCount: 0,
      hasMore: false,
      rows: []
    }
  };
}

function parseCatalogState(value: unknown, environment: ServiceTitanEnvironment) {
  if (!value || typeof value !== "object") {
    return getEmptyCatalog(environment);
  }

  const input = value as Partial<ServiceTitanCatalogState>;
  const fallback = getEmptyCatalog(environment);

  return {
    environment: input.environment === "INTEGRATION" ? "INTEGRATION" : environment,
    syncedAt: typeof input.syncedAt === "string" ? input.syncedAt : fallback.syncedAt,
    businessUnits: {
      syncedAt: typeof input.businessUnits?.syncedAt === "string" ? input.businessUnits.syncedAt : fallback.businessUnits.syncedAt,
      totalCount: typeof input.businessUnits?.totalCount === "number" ? input.businessUnits.totalCount : 0,
      hasMore: Boolean(input.businessUnits?.hasMore),
      rows: Array.isArray(input.businessUnits?.rows)
        ? input.businessUnits.rows.filter(
            (row): row is ServiceTitanCatalogRow =>
              Boolean(row) &&
              typeof row === "object" &&
              typeof (row as ServiceTitanCatalogRow).id === "string" &&
              typeof (row as ServiceTitanCatalogRow).name === "string"
          )
        : []
    },
    categories: {
      syncedAt: typeof input.categories?.syncedAt === "string" ? input.categories.syncedAt : fallback.categories.syncedAt,
      totalCount: typeof input.categories?.totalCount === "number" ? input.categories.totalCount : 0,
      hasMore: Boolean(input.categories?.hasMore),
      rows: Array.isArray(input.categories?.rows)
        ? input.categories.rows.filter(
            (row): row is ServiceTitanCatalogRow =>
              Boolean(row) &&
              typeof row === "object" &&
              typeof (row as ServiceTitanCatalogRow).id === "string" &&
              typeof (row as ServiceTitanCatalogRow).name === "string"
          )
        : []
    }
  } satisfies ServiceTitanCatalogState;
}

function updateCrmCapabilityFlags(flags: CapabilityFlags, isEnabled: boolean) {
  return normalizeCapabilityFlags({
    ...flags,
    hasCrmIntegration: isEnabled
  });
}

function findCatalogRow(rows: ServiceTitanCatalogRow[], reference: string | null | undefined) {
  if (!reference) {
    return null;
  }

  const normalized = reference.trim().toLowerCase();

  return (
    rows.find((row) => row.id.toLowerCase() === normalized) ??
    rows.find((row) => row.name.trim().toLowerCase() === normalized) ??
    null
  );
}

function getLatestRunByStatus<T extends { status: string; finishedAt: Date | null; startedAt: Date }>(
  runs: T[],
  statuses: string[]
) {
  return runs.find((run) => statuses.includes(run.status)) ?? null;
}

async function getConnectorCatalog(tenantId: string, environment: ServiceTitanEnvironment) {
  const saved = await getSystemSetting<ServiceTitanCatalogState>(tenantId, serviceTitanCatalogSettingKey);
  return parseCatalogState(saved, environment);
}

async function saveConnectorCatalog(tenantId: string, catalog: ServiceTitanCatalogState) {
  await upsertSystemSetting(tenantId, serviceTitanCatalogSettingKey, catalog);
  return catalog;
}

export async function getServiceTitanConnectorOverview(tenantId: string) {
  await refreshOperatorIssues(tenantId);

  const connectorConfig = await getServiceTitanCredentialConfig(tenantId);
  const [credential, capabilities, counts, businesses, locations, serviceCategories, recentSyncRuns, openIssues] =
    await Promise.all([
      getCredentialSet(tenantId, "CRM_SERVICETITAN"),
      getCapabilityFlags(tenantId),
      getConnectorInventoryCounts(tenantId),
      listConnectorBusinesses(tenantId),
      listConnectorLocations(tenantId),
      listConnectorServiceCategories(tenantId),
      listRecentConnectorSyncRuns(tenantId, 10),
      listOpenConnectorIssues(tenantId, 8)
    ]);
  const lifecycle = await getServiceTitanLifecycleSyncOverview(tenantId);

  const environment =
    credential && typeof (credential.metadataJson as { environment?: unknown } | null)?.environment === "string"
      ? ((credential.metadataJson as { environment?: string }).environment === "INTEGRATION" ? "INTEGRATION" : "PRODUCTION")
      : "PRODUCTION";
  const catalog = await getConnectorCatalog(tenantId, environment);
  const businessUnitMap = new Map(catalog.businessUnits.rows.map((row) => [row.id, row]));
  const categoryMap = new Map(catalog.categories.rows.map((row) => [row.id, row]));
  const health = credential ? getCredentialHealthViewModel(credential) : null;
  const latestSuccessfulRun = getLatestRunByStatus(recentSyncRuns, ["COMPLETED", "PARTIAL"]);
  const latestFailedRun = getLatestRunByStatus(recentSyncRuns, ["FAILED"]);

  return {
    connector: {
      name: "ServiceTitan",
      enabled: Boolean(credential?.isEnabled),
      capabilityEnabled: capabilities.hasCrmIntegration,
      environment,
      health,
      config: credential
        ? {
            label: credential.label,
            apiBaseUrl: credential.baseUrl || getDefaultServiceTitanUrls(environment).apiBaseUrl,
            authBaseUrl:
              typeof (credential.metadataJson as { authBaseUrl?: unknown } | null)?.authBaseUrl === "string"
                ? ((credential.metadataJson as { authBaseUrl?: string }).authBaseUrl ?? "")
                : getDefaultServiceTitanUrls(environment).authBaseUrl,
            tenantId:
              typeof (credential.metadataJson as { tenantId?: unknown } | null)?.tenantId === "string"
                ? ((credential.metadataJson as { tenantId?: string }).tenantId ?? "")
                : "",
            appKey:
              typeof (credential.metadataJson as { appKey?: unknown } | null)?.appKey === "string"
                ? ((credential.metadataJson as { appKey?: string }).appKey ?? "")
                : "",
            clientId: connectorConfig?.clientId ?? ""
          }
        : null
    },
    counts,
    latestSuccessfulRun,
    latestFailedRun,
    catalog: {
      environment: catalog.environment,
      syncedAt: catalog.syncedAt,
      businessUnits: catalog.businessUnits,
      categories: catalog.categories
    },
    businesses: businesses.map((business) => ({
      id: business.id,
      name: business.name,
      yelpBusinessId: business.encryptedYelpBusinessId,
      leadCount: business._count.yelpLeads,
      locationId: business.locationId,
      locationName: business.location?.name ?? null,
      locationConnectorReferenceId: business.location?.externalCrmLocationId ?? null,
      locationConnectorReferenceName:
        (business.location?.externalCrmLocationId
          ? businessUnitMap.get(business.location.externalCrmLocationId)?.name
          : null) ?? null,
      needsAttention: !business.locationId
    })),
    locations: locations.map((location) => ({
      id: location.id,
      name: location.name,
      code: location.code ?? null,
      businessCount: location._count.businesses,
      leadCount: location._count.yelpLeads,
      mappedLeadCount: location._count.crmLeadMappings,
      externalCrmLocationId: location.externalCrmLocationId ?? null,
      connectorReferenceName:
        (location.externalCrmLocationId ? businessUnitMap.get(location.externalCrmLocationId)?.name : null) ?? null,
      needsAttention: !location.externalCrmLocationId
    })),
    serviceCategories: serviceCategories.map((serviceCategory) => {
      const codes = Array.isArray(serviceCategory.crmCodesJson)
        ? (serviceCategory.crmCodesJson as string[]).filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        : [];
      const matches = codes
        .map((code) => findCatalogRow(catalog.categories.rows, code))
        .filter((row): row is ServiceTitanCatalogRow => Boolean(row));

      return {
        id: serviceCategory.id,
        name: serviceCategory.name,
        slug: serviceCategory.slug,
        leadCount: serviceCategory._count.yelpLeads,
        reportingSnapshotCount: serviceCategory._count.yelpReportingSnapshots,
        crmCodes: codes,
        connectorMatches: matches,
        needsAttention: codes.length === 0
      };
    }),
    recentSyncRuns: recentSyncRuns.map((run) => ({
      ...run,
      typeLabel: getServiceTitanLifecycleSyncLabel(getSyncAction(run.requestJson))
    })),
    lifecycle,
    openIssues: openIssues.map((issue) => ({
      ...issue,
      typeLabel: operatorIssueTypeLabels[issue.issueType],
      targetLabel:
        issue.lead?.customerName ??
        issue.lead?.externalLeadId ??
        issue.location?.name ??
        issue.business?.name ??
        "Connector"
    }))
  };
}

export async function saveServiceTitanConnectorWorkflow(tenantId: string, actorId: string, input: unknown) {
  const values = serviceTitanConnectorFormSchema.parse(input);
  const existing = await getCredentialSet(tenantId, "CRM_SERVICETITAN");
  const metadata = {
    environment: values.environment,
    authBaseUrl: values.authBaseUrl,
    tenantId: values.tenantId,
    appKey: values.appKey
  };

  const metadataChanged =
    JSON.stringify(existing?.metadataJson ?? null) !== JSON.stringify(metadata) ||
    (existing?.baseUrl ?? "") !== values.apiBaseUrl;
  const credentialsChanged =
    Boolean(values.clientId.trim()) ||
    Boolean(values.clientSecret?.trim()) ||
    metadataChanged;

  const saved = await upsertCredentialSet(tenantId, "CRM_SERVICETITAN", {
    tenantId,
    kind: "CRM_SERVICETITAN",
    label: values.label,
    usernameEncrypted: encryptSecret(values.clientId.trim()),
    secretEncrypted: values.clientSecret?.trim()
      ? encryptSecret(values.clientSecret.trim())
      : existing?.secretEncrypted ?? "",
    baseUrl: values.apiBaseUrl,
    isEnabled: values.isEnabled,
    metadataJson: toJsonValue(metadata),
    ...(credentialsChanged
      ? {
          lastTestStatus: "UNTESTED",
          lastErrorMessage: null,
          lastTestedAt: null
        }
      : {})
  });

  const currentCapabilities = await getCapabilityFlags(tenantId);
  await upsertSystemSetting(tenantId, "yelpCapabilities", updateCrmCapabilityFlags(currentCapabilities, values.isEnabled));

  await recordAuditEvent({
    tenantId,
    actorId,
    actionType: "integrations.servicetitan.save",
    status: "SUCCESS",
    requestSummary: {
      environment: values.environment,
      apiBaseUrl: values.apiBaseUrl,
      authBaseUrl: values.authBaseUrl,
      tenantId: values.tenantId,
      isEnabled: values.isEnabled
    },
    before: existing
      ? {
          ...existing,
          secretEncrypted: existing.secretEncrypted ? "configured" : null,
          usernameEncrypted: existing.usernameEncrypted ? "configured" : null
        }
      : undefined,
    after: {
      ...saved,
      secretEncrypted: saved.secretEncrypted ? "configured" : null,
      usernameEncrypted: saved.usernameEncrypted ? "configured" : null
    }
  });

  return saved;
}

export async function testServiceTitanConnectorWorkflow(tenantId: string, actorId: string) {
  const config = await getServiceTitanCredentialConfig(tenantId);

  if (!config) {
    throw new YelpValidationError("Save the ServiceTitan connector first before testing the connection.");
  }

  try {
    const client = new ServiceTitanClient(config);
    const result = await client.testConnection();

    await updateCredentialTestResult(tenantId, "CRM_SERVICETITAN", "SUCCESS", null);

    await recordAuditEvent({
      tenantId,
      actorId,
      actionType: "integrations.servicetitan.test",
      status: "SUCCESS",
      requestSummary: {
        environment: config.environment,
        tenantId: config.tenantId
      },
      responseSummary: result
    });

    return {
      status: "SUCCESS" as const,
      message: `Connected to ServiceTitan ${config.environment.toLowerCase()} and completed a safe employee probe.`,
      result
    };
  } catch (error) {
    const normalized = normalizeServiceTitanError(error);

    await updateCredentialTestResult(tenantId, "CRM_SERVICETITAN", "FAILED", normalized.message);

    await recordAuditEvent({
      tenantId,
      actorId,
      actionType: "integrations.servicetitan.test",
      status: "FAILED",
      requestSummary: {
        environment: config.environment,
        tenantId: config.tenantId
      },
      responseSummary: {
        message: normalized.message,
        code: normalized.code
      }
    });

    throw normalized;
  }
}

async function runLocationReferenceSync(tenantId: string, actorId: string, client: ServiceTitanClient, correlationId: string) {
  const syncRun = await createConnectorSyncRun({
    tenantId,
    type: "LOCATION_MAPPING",
    correlationId,
    requestJson: {
      action: "servicetitan.business_units.sync"
    }
  });

  try {
    const result = await client.listBusinessUnits();
    const config = await getServiceTitanCredentialConfig(tenantId);
    const existingCatalog = await getConnectorCatalog(tenantId, config?.environment ?? "PRODUCTION");
    const now = new Date().toISOString();
    const nextCatalog: ServiceTitanCatalogState = {
      ...existingCatalog,
      environment: config?.environment ?? existingCatalog.environment,
      syncedAt: now,
      businessUnits: {
        syncedAt: now,
        totalCount: result.totalCount,
        hasMore: result.hasMore,
        rows: result.rows
      }
    };

    await saveConnectorCatalog(tenantId, nextCatalog);
    await updateConnectorSyncRun(syncRun.id, {
      status: "COMPLETED",
      finishedAt: new Date(),
      lastSuccessfulSyncAt: new Date(),
      statsJson: {
        totalCount: result.totalCount,
        storedCount: result.rows.length,
        hasMore: result.hasMore
      },
      responseJson: {
        totalCount: result.totalCount,
        storedCount: result.rows.length
      }
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      actionType: "integrations.servicetitan.sync.locations",
      status: "SUCCESS",
      correlationId: syncRun.id,
      responseSummary: {
        totalCount: result.totalCount,
        storedCount: result.rows.length,
        hasMore: result.hasMore
      }
    });

    return {
      type: "LOCATION_MAPPING" as const,
      syncRunId: syncRun.id,
      status: "COMPLETED" as const,
      totalCount: result.totalCount,
      hasMore: result.hasMore
    };
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await createConnectorSyncError({
      tenantId,
      syncRunId: syncRun.id,
      category: "servicetitan.location_reference_sync",
      code: normalized.code,
      message: normalized.message,
      detailsJson: normalized.details
    });
    await updateConnectorSyncRun(syncRun.id, {
      status: "FAILED",
      finishedAt: new Date(),
      errorSummary: normalized.message,
      responseJson: {
        message: normalized.message,
        code: normalized.code
      }
    });

    logError("servicetitan.sync.locations.failed", {
      tenantId,
      syncRunId: syncRun.id,
      message: normalized.message
    });

    return {
      type: "LOCATION_MAPPING" as const,
      syncRunId: syncRun.id,
      status: "FAILED" as const,
      error: normalized.message
    };
  }
}

async function runServiceReferenceSync(tenantId: string, actorId: string, client: ServiceTitanClient, correlationId: string) {
  const syncRun = await createConnectorSyncRun({
    tenantId,
    type: "SERVICE_MAPPING",
    correlationId,
    requestJson: {
      action: "servicetitan.categories.sync"
    }
  });

  try {
    const result = await client.listCategories();
    const config = await getServiceTitanCredentialConfig(tenantId);
    const existingCatalog = await getConnectorCatalog(tenantId, config?.environment ?? "PRODUCTION");
    const now = new Date().toISOString();
    const nextCatalog: ServiceTitanCatalogState = {
      ...existingCatalog,
      environment: config?.environment ?? existingCatalog.environment,
      syncedAt: now,
      categories: {
        syncedAt: now,
        totalCount: result.totalCount,
        hasMore: result.hasMore,
        rows: result.rows
      }
    };

    await saveConnectorCatalog(tenantId, nextCatalog);
    await updateConnectorSyncRun(syncRun.id, {
      status: "COMPLETED",
      finishedAt: new Date(),
      lastSuccessfulSyncAt: new Date(),
      statsJson: {
        totalCount: result.totalCount,
        storedCount: result.rows.length,
        hasMore: result.hasMore
      },
      responseJson: {
        totalCount: result.totalCount,
        storedCount: result.rows.length
      }
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      actionType: "integrations.servicetitan.sync.services",
      status: "SUCCESS",
      correlationId: syncRun.id,
      responseSummary: {
        totalCount: result.totalCount,
        storedCount: result.rows.length,
        hasMore: result.hasMore
      }
    });

    return {
      type: "SERVICE_MAPPING" as const,
      syncRunId: syncRun.id,
      status: "COMPLETED" as const,
      totalCount: result.totalCount,
      hasMore: result.hasMore
    };
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await createConnectorSyncError({
      tenantId,
      syncRunId: syncRun.id,
      category: "servicetitan.service_reference_sync",
      code: normalized.code,
      message: normalized.message,
      detailsJson: normalized.details
    });
    await updateConnectorSyncRun(syncRun.id, {
      status: "FAILED",
      finishedAt: new Date(),
      errorSummary: normalized.message,
      responseJson: {
        message: normalized.message,
        code: normalized.code
      }
    });

    logError("servicetitan.sync.services.failed", {
      tenantId,
      syncRunId: syncRun.id,
      message: normalized.message
    });

    return {
      type: "SERVICE_MAPPING" as const,
      syncRunId: syncRun.id,
      status: "FAILED" as const,
      error: normalized.message
    };
  }
}

export async function syncServiceTitanReferenceDataWorkflow(tenantId: string, actorId: string, input: unknown) {
  const values = serviceTitanReferenceSyncSchema.parse(input);
  const config = await getServiceTitanCredentialConfig(tenantId);

  if (!config?.isEnabled) {
    throw new YelpValidationError("Enable the ServiceTitan connector before running a reference sync.");
  }

  const client = new ServiceTitanClient(config);
  const correlationId = randomUUID();
  const results = [];

  if (values.scope === "ALL" || values.scope === "LOCATIONS") {
    results.push(await runLocationReferenceSync(tenantId, actorId, client, `${correlationId}:locations`));
  }

  if (values.scope === "ALL" || values.scope === "SERVICES") {
    results.push(await runServiceReferenceSync(tenantId, actorId, client, `${correlationId}:services`));
  }

  return {
    scope: values.scope,
    results
  };
}

export async function saveBusinessLocationAssignmentWorkflow(tenantId: string, actorId: string, input: unknown) {
  const values = businessLocationAssignmentSchema.parse(input);
  const before = (await listConnectorBusinesses(tenantId)).find((business) => business.id === values.businessId) ?? null;

  if (!before) {
    throw new YelpValidationError("The selected Yelp business was not found for this tenant.");
  }

  const saved = await updateBusinessLocationAssignment(tenantId, values.businessId, values.locationId);

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: saved.id,
    actionType: "integrations.servicetitan.business-location.save",
    status: "SUCCESS",
    before: before
      ? {
          businessId: before.id,
          locationId: before.locationId,
          locationName: before.location?.name ?? null
        }
      : undefined,
    after: {
      businessId: saved.id,
      locationId: saved.locationId,
      locationName: saved.location?.name ?? null
    }
  });

  return saved;
}

export async function saveLocationConnectorMappingWorkflow(tenantId: string, actorId: string, input: unknown) {
  const values = locationConnectorMappingSchema.parse(input);
  const config = await getServiceTitanCredentialConfig(tenantId);
  const catalog = await getConnectorCatalog(tenantId, config?.environment ?? "PRODUCTION");
  const matchedReference = values.externalCrmLocationId
    ? findCatalogRow(catalog.businessUnits.rows, values.externalCrmLocationId)
    : null;
  const before = (await listConnectorLocations(tenantId)).find((location) => location.id === values.locationId) ?? null;

  if (!before) {
    throw new YelpValidationError("The selected internal location was not found for this tenant.");
  }

  const saved = await updateLocationConnectorReference(tenantId, values.locationId, {
    externalCrmLocationId: values.externalCrmLocationId,
    metadataJson: matchedReference
      ? {
          connector: "ServiceTitan",
          connectorReferenceName: matchedReference.name,
          connectorReferenceCode: matchedReference.code ?? null
        }
      : null,
    rawSnapshotJson: undefined
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    actionType: "integrations.servicetitan.location-mapping.save",
    status: "SUCCESS",
    requestSummary: {
      locationId: values.locationId,
      externalCrmLocationId: values.externalCrmLocationId
    },
    before: before
      ? {
          externalCrmLocationId: before.externalCrmLocationId ?? null
        }
      : undefined,
    after: {
      externalCrmLocationId: saved.externalCrmLocationId ?? null,
      connectorReferenceName: matchedReference?.name ?? null
    }
  });

  return saved;
}

export async function saveServiceConnectorMappingWorkflow(tenantId: string, actorId: string, input: unknown) {
  const values = serviceConnectorMappingSchema.parse(input);
  const config = await getServiceTitanCredentialConfig(tenantId);
  const catalog = await getConnectorCatalog(tenantId, config?.environment ?? "PRODUCTION");
  const matchedReferences = values.crmCodes
    .map((code) => findCatalogRow(catalog.categories.rows, code))
    .filter((row): row is ServiceTitanCatalogRow => Boolean(row));
  const before = (await listConnectorServiceCategories(tenantId)).find((category) => category.id === values.serviceCategoryId) ?? null;

  if (!before) {
    throw new YelpValidationError("The selected service category was not found for this tenant.");
  }

  const saved = await updateServiceCategoryConnectorCodes(tenantId, values.serviceCategoryId, {
    crmCodesJson: values.crmCodes,
    metadataJson: {
      connector: "ServiceTitan",
      connectorReferences: matchedReferences.map((row) => ({
        id: row.id,
        name: row.name
      }))
    }
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    actionType: "integrations.servicetitan.service-mapping.save",
    status: "SUCCESS",
    requestSummary: {
      serviceCategoryId: values.serviceCategoryId,
      crmCodes: values.crmCodes
    },
    before: before
      ? {
          crmCodes: Array.isArray(before.crmCodesJson) ? before.crmCodesJson : []
        }
      : undefined,
    after: {
      crmCodes: values.crmCodes,
      matchedConnectorReferences: matchedReferences.map((row) => row.name)
    }
  });

  return saved;
}
