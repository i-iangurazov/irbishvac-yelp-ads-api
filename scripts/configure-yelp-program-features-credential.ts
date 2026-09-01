import { getCapabilityFlags } from "../lib/yelp/runtime";
import {
  saveCapabilityFlags,
  saveCredentialSet,
  testCredentialConnection,
} from "../features/settings/service";
import { prisma } from "../lib/db/prisma";

async function main() {
  const rawCredential = process.env.YELP_CREDS?.trim() ?? "";
  const separatorIndex = rawCredential.indexOf(":");
  const businessId = process.env.YELP_INVENTORY_BUSINESS_ID;
  const probeProgramId = process.env.YELP_PROGRAM_FEATURE_PROBE_ID;
  const requestedActorEmail =
    process.env.YELP_RECONCILE_ACTOR_EMAIL ?? process.env.SEED_ADMIN_EMAIL;

  if (
    separatorIndex < 1 ||
    separatorIndex === rawCredential.length - 1 ||
    !businessId ||
    !probeProgramId
  ) {
    throw new Error(
      "Set YELP_CREDS as username:password, YELP_INVENTORY_BUSINESS_ID, and YELP_PROGRAM_FEATURE_PROBE_ID.",
    );
  }

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { tenantId: true },
  });
  const actors = await prisma.user.findMany({
    where: {
      tenantId: business.tenantId,
      isActive: true,
      ...(requestedActorEmail ? { email: requestedActorEmail } : {}),
    },
    select: { id: true, role: { select: { code: true } } },
  });
  const platformActors = actors.filter((actor) =>
    ["PLATFORM_ADMIN", "OWNER", "ADMIN"].includes(actor.role.code),
  );

  if (platformActors.length !== 1) {
    throw new Error(
      `Expected one active platform administrator for audit attribution; found ${platformActors.length}.`,
    );
  }

  const username = rawCredential.slice(0, separatorIndex);
  const secret = rawCredential.slice(separatorIndex + 1);
  const actorId = platformActors[0]!.id;

  await saveCredentialSet(business.tenantId, actorId, {
    kind: "DATA_INGESTION",
    label: "Yelp Program Features API",
    username,
    secret,
    baseUrl: "https://partner-api.yelp.com",
    isEnabled: true,
    testPath: `/program/${probeProgramId}/features/v1`,
  });

  const capabilities = await getCapabilityFlags(business.tenantId);
  await saveCapabilityFlags(business.tenantId, actorId, {
    ...capabilities,
    dataIngestionApiEnabled: true,
    programFeatureApiEnabled: true,
  });

  const result = await testCredentialConnection(
    business.tenantId,
    actorId,
    "DATA_INGESTION",
  );

  if (result.status !== "SUCCESS") {
    throw new Error(result.message);
  }

  console.log(
    JSON.stringify({
      ok: true,
      credentialKind: "DATA_INGESTION",
      programFeatureApiEnabled: true,
      connectionStatus: result.status,
      message: result.message,
    }),
  );
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown failure",
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
