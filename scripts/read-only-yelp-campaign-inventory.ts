import { prisma } from "../lib/db/prisma";
import { YelpAdsClient } from "../lib/yelp/ads-client";
import { ensureYelpAccess } from "../lib/yelp/runtime";
import type { YelpUpstreamProgramDto } from "../lib/yelp/schemas";

const currentStatuses = [
  "DRAFT",
  "QUEUED",
  "PROCESSING",
  "ACTIVE",
  "SCHEDULED",
] as const;

async function main() {
  const requestedBusinessId = process.env.YELP_INVENTORY_BUSINESS_ID;
  const candidates = await prisma.business.findMany({
    where: {
      ...(requestedBusinessId ? { id: requestedBusinessId } : {}),
      programs: {
        some: {
          type: "CPC",
          status: { in: [...currentStatuses] },
        },
      },
    },
    select: {
      id: true,
      name: true,
      tenantId: true,
      encryptedYelpBusinessId: true,
      tenant: { select: { slug: true } },
    },
  });

  if (candidates.length !== 1) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason:
            candidates.length === 0
              ? "No current CPC business matched."
              : "Multiple CPC businesses matched; set YELP_INVENTORY_BUSINESS_ID.",
          candidates: candidates.map((candidate) => ({
            localBusinessId: candidate.id,
            businessName: candidate.name,
            tenantSlug: candidate.tenant.slug,
          })),
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
    return;
  }

  const business = candidates[0]!;
  const { credential } = await ensureYelpAccess({
    tenantId: business.tenantId,
    capabilityKey: "adsApiEnabled",
    credentialKind: "ADS_BASIC_AUTH",
  });
  const client = new YelpAdsClient(credential);
  const response = await client.listPrograms(business.encryptedYelpBusinessId);
  const upstreamBusiness = response.data.businesses.find(
    (entry) => entry.yelp_business_id === business.encryptedYelpBusinessId,
  );

  if (!upstreamBusiness) {
    throw new Error(
      "Yelp did not return the canonical business in Program List.",
    );
  }

  const programs =
    upstreamBusiness.programs as unknown as YelpUpstreamProgramDto[];
  const programIds = programs.map((program) => program.program_id);
  const duplicateProgramIds = programIds.filter(
    (programId, index) => programIds.indexOf(programId) !== index,
  );
  const destinationLocalBusiness = upstreamBusiness.destination_yelp_business_id
    ? await prisma.business.findUnique({
        where: {
          tenantId_encryptedYelpBusinessId: {
            tenantId: business.tenantId,
            encryptedYelpBusinessId:
              upstreamBusiness.destination_yelp_business_id,
          },
        },
        select: { id: true },
      })
    : null;
  const currentPrograms = programs.filter(
    (program) =>
      program.program_type === "CPC" &&
      currentStatuses.includes(
        program.program_status as (typeof currentStatuses)[number],
      ),
  );
  const statusCounts = programs.reduce<Record<string, number>>(
    (counts, program) => ({
      ...counts,
      [program.program_status]: (counts[program.program_status] ?? 0) + 1,
    }),
    {},
  );

  console.log(
    JSON.stringify(
      {
        ok: duplicateProgramIds.length === 0,
        readOnly: true,
        tenantSlug: business.tenant.slug,
        localBusinessId: business.id,
        businessName: business.name,
        canonicalDestination: {
          isSelectedRecord:
            !upstreamBusiness.destination_yelp_business_id ||
            upstreamBusiness.destination_yelp_business_id ===
              business.encryptedYelpBusinessId,
          localBusinessId: destinationLocalBusiness?.id ?? null,
        },
        source: "Yelp Program List",
        upstreamProgramCount: programs.length,
        statusCounts,
        duplicateUpstreamProgramIds: [...new Set(duplicateProgramIds)],
        currentCpcPrograms: currentPrograms.map((program) => ({
          upstreamProgramId: program.program_id,
          type: program.program_type,
          status: program.program_status,
          pauseStatus: program.program_pause_status ?? null,
          categories: program.ad_categories,
          budgetCents: program.program_metrics?.budget ?? null,
          currency: program.program_metrics?.currency ?? null,
          startDate: program.start_date ?? null,
          endDate: program.end_date ?? null,
          feePeriod: program.program_metrics?.fee_period ?? null,
        })),
        providerErrors: response.data.errors.length,
      },
      null,
      2,
    ),
  );

  if (duplicateProgramIds.length > 0 || response.data.errors.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown read-only inventory failure",
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
