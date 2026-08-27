import { createHash } from "node:crypto";

import { prisma } from "../lib/db/prisma";
import { YelpAdsClient } from "../lib/yelp/ads-client";
import { YelpApiError } from "../lib/yelp/errors";
import { YelpFeaturesClient } from "../lib/yelp/features-client";
import { getCredentialConfig } from "../lib/yelp/runtime";

const currentStatuses = [
  "DRAFT",
  "QUEUED",
  "PROCESSING",
  "ACTIVE",
  "SCHEDULED",
] as const;

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function providerErrorCode(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }

  const record = details as Record<string, unknown>;
  const nested =
    record.error &&
    typeof record.error === "object" &&
    !Array.isArray(record.error)
      ? (record.error as Record<string, unknown>)
      : record;

  for (const key of ["code", "error_code", "type"]) {
    if (typeof nested[key] === "string") {
      return nested[key];
    }
  }

  return null;
}

async function main() {
  const programs = await prisma.program.findMany({
    where: {
      upstreamProgramId: { not: null },
      type: "CPC",
      status: { in: [...currentStatuses] },
    },
    orderBy: [{ tenantId: "asc" }, { createdAt: "asc" }],
    select: {
      tenantId: true,
      upstreamProgramId: true,
      status: true,
      startDate: true,
      endDate: true,
      business: {
        select: {
          encryptedYelpBusinessId: true,
        },
      },
    },
  });

  const credentialKinds = ["ADS_BASIC_AUTH", "DATA_INGESTION"] as const;
  const credentialCache = new Map<
    string,
    Awaited<ReturnType<typeof getCredentialConfig>>
  >();
  const programListCache = new Map<
    string,
    Awaited<ReturnType<YelpAdsClient["listPrograms"]>> | null
  >();
  const results: Array<Record<string, unknown>> = [];

  for (const [index, program] of programs.entries()) {
    const upstreamProgramId = program.upstreamProgramId;
    if (!upstreamProgramId) continue;

    const adsCredentialKey = `${program.tenantId}:ADS_BASIC_AUTH`;
    let adsCredential = credentialCache.get(adsCredentialKey);
    if (adsCredential === undefined) {
      adsCredential = await getCredentialConfig(
        program.tenantId,
        "ADS_BASIC_AUTH",
      );
      credentialCache.set(adsCredentialKey, adsCredential);
    }

    const programListKey = `${program.tenantId}:${program.business.encryptedYelpBusinessId}`;
    let programList = programListCache.get(programListKey);
    if (programList === undefined) {
      programList =
        adsCredential?.isEnabled &&
        adsCredential.username &&
        adsCredential.secret
          ? await new YelpAdsClient(adsCredential).listPrograms(
              program.business.encryptedYelpBusinessId,
            )
          : null;
      programListCache.set(programListKey, programList);
    }

    const providerProgram = programList?.data.businesses
      .flatMap((business) => business.programs)
      .find((candidate) => candidate.program_id === upstreamProgramId);

    for (const credentialKind of credentialKinds) {
      const cacheKey = `${program.tenantId}:${credentialKind}`;
      let credential = credentialCache.get(cacheKey);
      if (credential === undefined) {
        credential = await getCredentialConfig(
          program.tenantId,
          credentialKind,
        );
        credentialCache.set(cacheKey, credential);
      }

      const base = {
        programIndex: index + 1,
        programFingerprint: fingerprint(upstreamProgramId),
        programStatus: program.status,
        startDate: program.startDate?.toISOString().slice(0, 10) ?? null,
        endDate: program.endDate?.toISOString().slice(0, 10) ?? null,
        foundInLiveProgramList: Boolean(providerProgram),
        negativeKeywordAvailableInProgramList:
          providerProgram?.available_features.includes(
            "NEGATIVE_KEYWORD_TARGETING",
          ) ?? false,
        negativeKeywordActiveInProgramList:
          providerProgram?.active_features.includes(
            "NEGATIVE_KEYWORD_TARGETING",
          ) ?? false,
        credentialKind,
      };

      if (
        !credential ||
        !credential.isEnabled ||
        !credential.username ||
        !credential.secret
      ) {
        results.push({ ...base, outcome: "CREDENTIAL_NOT_CONFIGURED" });
        continue;
      }

      try {
        const response = await new YelpFeaturesClient(
          credential,
        ).getProgramFeatures(upstreamProgramId);
        const negativeKeywords =
          response.data.features.NEGATIVE_KEYWORD_TARGETING;
        results.push({
          ...base,
          outcome: "SUCCESS",
          featureTypes: Object.keys(response.data.features).sort(),
          negativeKeywordTargetingAvailable:
            "NEGATIVE_KEYWORD_TARGETING" in response.data.features,
          negativeKeywordTargetingActive: negativeKeywords !== null,
          suggestedKeywordCount:
            negativeKeywords?.suggested_keywords.length ?? 0,
          blockedKeywordCount: negativeKeywords?.blocked_keywords.length ?? 0,
        });
      } catch (error) {
        if (error instanceof YelpApiError) {
          results.push({
            ...base,
            outcome: "PROVIDER_ERROR",
            httpStatus: error.status,
            errorCode: error.code,
            providerErrorCode: providerErrorCode(error.details),
            message: error.message,
          });
          continue;
        }

        results.push({
          ...base,
          outcome: "LOCAL_ERROR",
          message:
            error instanceof Error ? error.message : "Unknown local error",
        });
      }
    }
  }

  const counts = results.reduce<Record<string, number>>((summary, result) => {
    const key = `${result.credentialKind}:${result.outcome}`;
    summary[key] = (summary[key] ?? 0) + 1;
    return summary;
  }, {});

  console.log(
    JSON.stringify(
      {
        ok: results.some((result) => result.outcome === "SUCCESS"),
        readOnly: true,
        endpoint: "GET /program/{program_id}/features/v1",
        requestQueryParameters: [],
        requestBody: null,
        testedAt: new Date().toISOString(),
        currentProgramCount: programs.length,
        counts,
        results,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        readOnly: true,
        error:
          error instanceof Error
            ? error.message
            : "Unknown keyword diagnostics failure",
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
