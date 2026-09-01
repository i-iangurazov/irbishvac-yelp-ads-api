import "server-only";

import {
  getProgramCampaignLayer,
  isSeptemberCampaignLayer,
} from "@/features/ads-programs/layers";
import { featureCatalog } from "@/features/program-features/schemas";
import {
  keywordSetsMatch,
  negativeKeywordUpdateSchema,
  normalizeBlockedKeywords,
} from "@/features/program-features/keywords";
import { recordAuditEvent } from "@/features/audit/service";
import {
  createProgramFeatureSnapshot,
  getProgramById,
  listProgramFeatures,
} from "@/lib/db/programs-repository";
import { ensureYelpAccess, getCapabilityFlags } from "@/lib/yelp/runtime";
import { YelpFeaturesClient } from "@/lib/yelp/features-client";
import { normalizeUnknownError, YelpValidationError } from "@/lib/yelp/errors";

const NEGATIVE_KEYWORD_TYPE = "NEGATIVE_KEYWORD_TARGETING" as const;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getLatestFeatureState(
  featureSnapshots: Awaited<ReturnType<typeof listProgramFeatures>>,
) {
  const latestByType = new Map<string, (typeof featureSnapshots)[number]>();

  for (const snapshot of featureSnapshots) {
    if (!latestByType.has(snapshot.type)) {
      latestByType.set(snapshot.type, snapshot);
    }
  }

  return Array.from(latestByType.values());
}

function readKeywordSnapshot(
  featureSnapshots: Awaited<ReturnType<typeof listProgramFeatures>>,
) {
  const snapshot = getLatestFeatureState(featureSnapshots).find(
    (item) => item.type === NEGATIVE_KEYWORD_TYPE,
  );
  const value = asRecord(snapshot?.valueJson);

  return {
    snapshot,
    suggestedKeywords: normalizeBlockedKeywords(
      stringArray(value.suggestedKeywords ?? value.suggested_keywords),
    ),
    blockedKeywords: normalizeBlockedKeywords(
      stringArray(
        value.blockedKeywords ?? value.blocked_keywords ?? value.keywords,
      ),
    ),
  };
}

function getProviderKeywordState(features: Record<string, unknown>) {
  if (!(NEGATIVE_KEYWORD_TYPE in features)) {
    return null;
  }

  const value = features[NEGATIVE_KEYWORD_TYPE];

  if (value === null) {
    return {
      suggestedKeywords: [],
      blockedKeywords: [],
    };
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const state = asRecord(value);

  return {
    suggestedKeywords: normalizeBlockedKeywords(
      stringArray(state.suggested_keywords),
    ),
    blockedKeywords: normalizeBlockedKeywords(
      stringArray(state.blocked_keywords),
    ),
  };
}

function assertKeywordReadBack(expected: string[], actual: string[]) {
  if (!keywordSetsMatch(expected, actual)) {
    throw new YelpValidationError(
      "Yelp accepted the request but the read-back did not match. No local success state was recorded.",
      { expectedCount: expected.length, actualCount: actual.length },
    );
  }
}

function assertProgramCanManageFeatures(
  program: Awaited<ReturnType<typeof getProgramById>>,
) {
  if (program.status === "ENDED") {
    throw new YelpValidationError(
      "This program is already ended, so keyword changes are blocked.",
    );
  }

  if (program.status === "QUEUED" || program.status === "PROCESSING") {
    throw new YelpValidationError(
      "Wait for the current Yelp job to finish before changing keywords.",
    );
  }

  if (!program.upstreamProgramId) {
    throw new YelpValidationError(
      "This program has no confirmed Yelp program ID yet. Keyword changes require a successfully created Yelp program.",
    );
  }

  return program.upstreamProgramId;
}

export async function getProgramFeatureOverview(
  tenantId: string,
  programId: string,
) {
  const [program, featureSnapshots, capabilities] = await Promise.all([
    getProgramById(programId, tenantId),
    listProgramFeatures(programId, tenantId),
    getCapabilityFlags(tenantId),
  ]);
  const latestFeatures = getLatestFeatureState(featureSnapshots);
  const localKeywords = readKeywordSnapshot(featureSnapshots);
  const demoFallback =
    capabilities.demoModeEnabled && !capabilities.programFeatureApiEnabled;
  let enabledFeatureTypes: Array<keyof typeof featureCatalog> = latestFeatures
    .filter((feature) => !feature.isDeleted)
    .map((feature) => feature.type)
    .filter(
      (type): type is keyof typeof featureCatalog => type in featureCatalog,
    );
  let negativeKeywords: {
    supported: boolean;
    suggestedKeywords: string[];
    blockedKeywords: string[];
    source: "YELP_LIVE" | "LOCAL_SNAPSHOT" | "DEMO_SNAPSHOT";
    syncedAt: string | null;
    message: string;
  } = {
    supported:
      demoFallback ||
      Boolean(localKeywords.snapshot && !localKeywords.snapshot.isDeleted),
    suggestedKeywords: localKeywords.suggestedKeywords,
    blockedKeywords: localKeywords.blockedKeywords,
    source: demoFallback
      ? ("DEMO_SNAPSHOT" as const)
      : ("LOCAL_SNAPSHOT" as const),
    syncedAt: localKeywords.snapshot?.capturedAt.toISOString() ?? null,
    message: demoFallback
      ? "Demo mode: changes are stored locally and are not sent to Yelp."
      : "Live Yelp keyword data is unavailable; the last local snapshot is shown.",
  };
  let liveFeatureState: { loaded: boolean; message: string | null } = {
    loaded: false,
    message: capabilities.programFeatureApiEnabled
      ? "A confirmed Yelp program ID is required before feature data can be loaded."
      : "Program Feature API access is not enabled for this tenant.",
  };

  if (capabilities.programFeatureApiEnabled && program.upstreamProgramId) {
    try {
      const { credential } = await ensureYelpAccess({
        tenantId,
        capabilityKey: "programFeatureApiEnabled",
        credentialKind: "DATA_INGESTION",
      });
      const response = await new YelpFeaturesClient(
        credential,
      ).getProgramFeatures(program.upstreamProgramId);
      const providerKeywords = getProviderKeywordState(response.data.features);

      enabledFeatureTypes = Object.keys(response.data.features).filter(
        (type): type is keyof typeof featureCatalog => type in featureCatalog,
      );
      negativeKeywords = {
        supported: providerKeywords !== null,
        suggestedKeywords: providerKeywords?.suggestedKeywords ?? [],
        blockedKeywords: providerKeywords?.blockedKeywords ?? [],
        source: "YELP_LIVE" as const,
        syncedAt: new Date().toISOString(),
        message: providerKeywords
          ? "Loaded directly from Yelp. Saving changes requires a successful provider read-back."
          : "Yelp does not expose Negative Keyword Targeting for this program.",
      };
      liveFeatureState = {
        loaded: true,
        message: null,
      };
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      liveFeatureState = {
        loaded: false,
        message: normalized.message,
      };
    }
  }

  return {
    program,
    features: latestFeatures,
    enabledFeatureTypes: Array.from(new Set(enabledFeatureTypes)) as Array<
      keyof typeof featureCatalog
    >,
    negativeKeywords,
    liveFeatureState,
    capabilityState: {
      enabled: capabilities.programFeatureApiEnabled,
      demoMode: demoFallback,
      message: capabilities.programFeatureApiEnabled
        ? null
        : demoFallback
          ? "Demo mode is active. Keyword writes remain local until Yelp Program Feature API access is enabled."
          : "Not enabled by Yelp or missing Program Feature API credentials.",
    },
  };
}

export async function updateProgramFeatureWorkflow(
  tenantId: string,
  actorId: string,
  programId: string,
  input: unknown,
  context?: { approvedSeptemberReconciliation?: boolean },
) {
  const value = negativeKeywordUpdateSchema.parse(input);
  const program = await getProgramById(programId, tenantId);

  if (
    isSeptemberCampaignLayer(
      getProgramCampaignLayer(program.configurationJson),
    ) &&
    !context?.approvedSeptemberReconciliation
  ) {
    throw new YelpValidationError(
      "September layer keyword targeting is locked to the audited campaign plan.",
    );
  }

  const currentSnapshots = await listProgramFeatures(programId, tenantId);
  const localBefore = readKeywordSnapshot(currentSnapshots);
  let beforeBlockedKeywords = localBefore.blockedKeywords;
  let suggestedKeywords = localBefore.suggestedKeywords;
  let blockedKeywords = value.blockedKeywords;
  let source = "DEMO_SNAPSHOT";
  let correlationId: string | undefined;

  try {
    const capabilities = await getCapabilityFlags(tenantId);

    if (
      !(capabilities.demoModeEnabled && !capabilities.programFeatureApiEnabled)
    ) {
      const upstreamProgramId = assertProgramCanManageFeatures(program);
      const { credential } = await ensureYelpAccess({
        tenantId,
        capabilityKey: "programFeatureApiEnabled",
        credentialKind: "DATA_INGESTION",
      });
      const client = new YelpFeaturesClient(credential);
      const beforeResponse = await client.getProgramFeatures(upstreamProgramId);
      const providerBefore = getProviderKeywordState(
        beforeResponse.data.features,
      );

      if (!providerBefore) {
        throw new YelpValidationError(
          "Yelp does not expose Negative Keyword Targeting for this program.",
        );
      }

      beforeBlockedKeywords = providerBefore.blockedKeywords;
      const updateResponse = await client.updateNegativeKeywords(
        upstreamProgramId,
        value.blockedKeywords,
      );
      const readBackResponse =
        await client.getProgramFeatures(upstreamProgramId);
      const providerAfter = getProviderKeywordState(
        readBackResponse.data.features,
      );

      if (!providerAfter) {
        throw new YelpValidationError(
          "Yelp did not return Negative Keyword Targeting during verification.",
        );
      }

      assertKeywordReadBack(
        value.blockedKeywords,
        providerAfter.blockedKeywords,
      );
      suggestedKeywords = providerAfter.suggestedKeywords;
      blockedKeywords = providerAfter.blockedKeywords;
      source = "YELP_READ_BACK";
      correlationId = updateResponse.correlationId;
    }

    const capturedAt = new Date();
    const snapshotValue = {
      type: NEGATIVE_KEYWORD_TYPE,
      suggestedKeywords,
      blockedKeywords,
      source,
      readBackAt: capturedAt.toISOString(),
    };
    const snapshot = await createProgramFeatureSnapshot({
      tenantId,
      businessId: program.businessId,
      programId: program.id,
      type: NEGATIVE_KEYWORD_TYPE,
      valueJson: snapshotValue,
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: program.businessId,
      programId: program.id,
      actionType: "feature.negative_keyword_targeting.update",
      status: "SUCCESS",
      correlationId,
      upstreamReference: program.upstreamProgramId,
      requestSummary: {
        blockedKeywordCount: value.blockedKeywords.length,
        blockedKeywords: value.blockedKeywords,
      },
      before: { blockedKeywords: beforeBlockedKeywords },
      after: snapshotValue,
    });

    return { snapshot, negativeKeywords: snapshotValue };
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: program.businessId,
      programId: program.id,
      actionType: "feature.negative_keyword_targeting.update",
      status: "FAILED",
      correlationId,
      upstreamReference: program.upstreamProgramId,
      requestSummary: { blockedKeywordCount: value.blockedKeywords.length },
      responseSummary: { code: normalized.code, message: normalized.message },
    });

    throw normalized;
  }
}

export async function deleteProgramFeatureWorkflow(
  tenantId: string,
  actorId: string,
  programId: string,
  featureType: string,
  context?: { approvedSeptemberReconciliation?: boolean },
) {
  if (featureType !== NEGATIVE_KEYWORD_TYPE) {
    throw new YelpValidationError(
      "Only Negative Keyword Targeting is supported by this production workflow.",
    );
  }

  const program = await getProgramById(programId, tenantId);

  if (
    isSeptemberCampaignLayer(
      getProgramCampaignLayer(program.configurationJson),
    ) &&
    !context?.approvedSeptemberReconciliation
  ) {
    throw new YelpValidationError(
      "September layer keyword targeting cannot be cleared outside the audited campaign workflow.",
    );
  }

  const currentSnapshots = await listProgramFeatures(programId, tenantId);
  const localBefore = readKeywordSnapshot(currentSnapshots);
  let beforeBlockedKeywords = localBefore.blockedKeywords;
  let suggestedKeywords = localBefore.suggestedKeywords;
  let correlationId: string | undefined;

  try {
    const capabilities = await getCapabilityFlags(tenantId);
    const demoFallback =
      capabilities.demoModeEnabled && !capabilities.programFeatureApiEnabled;

    if (!demoFallback) {
      const upstreamProgramId = assertProgramCanManageFeatures(program);
      const { credential } = await ensureYelpAccess({
        tenantId,
        capabilityKey: "programFeatureApiEnabled",
        credentialKind: "DATA_INGESTION",
      });
      const client = new YelpFeaturesClient(credential);
      const beforeResponse = await client.getProgramFeatures(upstreamProgramId);
      const providerBefore = getProviderKeywordState(
        beforeResponse.data.features,
      );

      if (!providerBefore) {
        throw new YelpValidationError(
          "Yelp does not expose Negative Keyword Targeting for this program.",
        );
      }

      beforeBlockedKeywords = providerBefore.blockedKeywords;
      const deleteResponse = await client.deleteProgramFeatures(
        upstreamProgramId,
        [NEGATIVE_KEYWORD_TYPE],
      );
      const readBackResponse =
        await client.getProgramFeatures(upstreamProgramId);
      const providerAfter = getProviderKeywordState(
        readBackResponse.data.features,
      );

      if (!providerAfter) {
        throw new YelpValidationError(
          "Yelp did not return Negative Keyword Targeting during verification.",
        );
      }

      assertKeywordReadBack([], providerAfter.blockedKeywords);
      suggestedKeywords = providerAfter.suggestedKeywords;
      correlationId = deleteResponse.correlationId;
    }

    const capturedAt = new Date();
    const snapshotValue = {
      type: NEGATIVE_KEYWORD_TYPE,
      suggestedKeywords,
      blockedKeywords: [],
      source: demoFallback ? "DEMO_SNAPSHOT" : "YELP_READ_BACK",
      readBackAt: capturedAt.toISOString(),
    };
    const snapshot = await createProgramFeatureSnapshot({
      tenantId,
      businessId: program.businessId,
      programId: program.id,
      type: NEGATIVE_KEYWORD_TYPE,
      isDeleted: true,
      valueJson: snapshotValue,
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: program.businessId,
      programId: program.id,
      actionType: "feature.negative_keyword_targeting.clear",
      status: "SUCCESS",
      correlationId,
      upstreamReference: program.upstreamProgramId,
      before: { blockedKeywords: beforeBlockedKeywords },
      after: snapshotValue,
    });

    return { snapshot, negativeKeywords: snapshotValue };
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: program.businessId,
      programId: program.id,
      actionType: "feature.negative_keyword_targeting.clear",
      status: "FAILED",
      correlationId,
      upstreamReference: program.upstreamProgramId,
      responseSummary: { code: normalized.code, message: normalized.message },
    });

    throw normalized;
  }
}
