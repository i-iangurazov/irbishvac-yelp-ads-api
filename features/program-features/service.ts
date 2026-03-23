import "server-only";

import { featureFormSchema } from "@/features/program-features/schemas";
import { recordAuditEvent } from "@/features/audit/service";
import { createProgramFeatureSnapshot, getProgramById, listProgramFeatures } from "@/lib/db/programs-repository";
import { mapFeatureFormToDto } from "@/lib/yelp/mappers";
import { ensureYelpAccess, getCapabilityFlags } from "@/lib/yelp/runtime";
import { YelpFeaturesClient } from "@/lib/yelp/features-client";
import { normalizeUnknownError, YelpValidationError } from "@/lib/yelp/errors";

function getLatestFeatureState(featureSnapshots: Awaited<ReturnType<typeof listProgramFeatures>>) {
  const latestByType = new Map<string, (typeof featureSnapshots)[number]>();

  for (const snapshot of featureSnapshots) {
    if (!latestByType.has(snapshot.type)) {
      latestByType.set(snapshot.type, snapshot);
    }
  }

  return Array.from(latestByType.values());
}

function assertProgramCanManageFeatures(program: Awaited<ReturnType<typeof getProgramById>>) {
  if (program.status === "ENDED") {
    throw new YelpValidationError("This program is already ended, so feature changes are blocked.");
  }

  if (program.status === "QUEUED" || program.status === "PROCESSING") {
    throw new YelpValidationError("Wait for the current Yelp job to finish before changing program features.");
  }

  if (!program.upstreamProgramId) {
    throw new YelpValidationError(
      "This program has no confirmed Yelp program ID yet. Its create job never completed successfully on Yelp, so feature changes cannot be sent upstream."
    );
  }

  return program.upstreamProgramId;
}

export async function getProgramFeatureOverview(tenantId: string, programId: string) {
  const [program, featureSnapshots, capabilities] = await Promise.all([
    getProgramById(programId, tenantId),
    listProgramFeatures(programId, tenantId),
    getCapabilityFlags(tenantId)
  ]);

  return {
    program,
    features: getLatestFeatureState(featureSnapshots),
    capabilityState: {
      enabled: capabilities.programFeatureApiEnabled,
      message: capabilities.programFeatureApiEnabled ? null : "Not enabled by Yelp / missing credentials."
    }
  };
}

export async function updateProgramFeatureWorkflow(tenantId: string, actorId: string, programId: string, input: unknown) {
  const value = featureFormSchema.parse(input);
  const program = await getProgramById(programId, tenantId);
  const currentSnapshots = await listProgramFeatures(programId, tenantId);
  const latestFeatures = getLatestFeatureState(currentSnapshots)
    .filter((item) => !item.isDeleted && item.type !== value.type)
    .map((item) => item.valueJson);

  const merged = [...latestFeatures, mapFeatureFormToDto(value)];

  try {
    const capabilities = await getCapabilityFlags(tenantId);

    if (!(capabilities.demoModeEnabled && !capabilities.programFeatureApiEnabled)) {
      const upstreamProgramId = assertProgramCanManageFeatures(program);
      const { credential } = await ensureYelpAccess({
        tenantId,
        capabilityKey: "programFeatureApiEnabled",
        credentialKind: "ADS_BASIC_AUTH"
      });
      const client = new YelpFeaturesClient(credential);
      await client.updateProgramFeatures(upstreamProgramId, merged as never);
    }

    const snapshot = await createProgramFeatureSnapshot({
      tenantId,
      businessId: program.businessId,
      programId: program.id,
      type: value.type,
      valueJson: value
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: program.businessId,
      programId: program.id,
      actionType: `feature.${value.type.toLowerCase()}.update`,
      status: "SUCCESS",
      requestSummary: value as never,
      after: snapshot as never
    });

    return snapshot;
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: program.businessId,
      programId: program.id,
      actionType: `feature.${value.type.toLowerCase()}.update`,
      status: "FAILED",
      requestSummary: value as never,
      responseSummary: { message: normalized.message } as never
    });

    throw normalized;
  }
}

export async function deleteProgramFeatureWorkflow(
  tenantId: string,
  actorId: string,
  programId: string,
  featureType: string
) {
  const program = await getProgramById(programId, tenantId);

  try {
    const capabilities = await getCapabilityFlags(tenantId);

    if (!(capabilities.demoModeEnabled && !capabilities.programFeatureApiEnabled)) {
      const upstreamProgramId = assertProgramCanManageFeatures(program);
      const { credential } = await ensureYelpAccess({
        tenantId,
        capabilityKey: "programFeatureApiEnabled",
        credentialKind: "ADS_BASIC_AUTH"
      });
      const client = new YelpFeaturesClient(credential);
      await client.deleteProgramFeatures(upstreamProgramId, featureType as never);
    }

    const snapshot = await createProgramFeatureSnapshot({
      tenantId,
      businessId: program.businessId,
      programId: program.id,
      type: featureType as never,
      isDeleted: true,
      valueJson: {}
    });

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: program.businessId,
      programId: program.id,
      actionType: `feature.${featureType.toLowerCase()}.delete`,
      status: "SUCCESS",
      after: snapshot as never
    });

    return snapshot;
  } catch (error) {
    const normalized = normalizeUnknownError(error);

    await recordAuditEvent({
      tenantId,
      actorId,
      businessId: program.businessId,
      programId: program.id,
      actionType: `feature.${featureType.toLowerCase()}.delete`,
      status: "FAILED",
      responseSummary: { message: normalized.message } as never
    });

    throw normalized;
  }
}
