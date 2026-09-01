import { reconcileSeptemberCampaignWorkflow } from "../features/ads-programs/service";
import { prisma } from "../lib/db/prisma";

const allowedLayers = new Set([
  "SEPTEMBER_HVAC_INSTALLATION",
  "SEPTEMBER_HVAC_REPAIR",
  "SEPTEMBER_HVAC_MAINTENANCE",
  "SEPTEMBER_COMMERCIAL_HVAC",
  "SEPTEMBER_PLUMBING",
  "SEPTEMBER_END_OF_MONTH_BOOST",
]);

function parseBlockedKeywords() {
  const raw = process.env.SEPTEMBER_BLOCKED_KEYWORDS_JSON;

  if (!raw) {
    return [];
  }

  const value: unknown = JSON.parse(raw);

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(
      "SEPTEMBER_BLOCKED_KEYWORDS_JSON must be a JSON array of strings.",
    );
  }

  return value;
}

async function main() {
  const businessId = process.env.YELP_INVENTORY_BUSINESS_ID;
  const campaignLayer = process.env.SEPTEMBER_CAMPAIGN_LAYER;
  const mainProgramId = process.env.YELP_MAIN_PROGRAM_ID;
  const adoptUpstreamProgramId =
    process.env.SEPTEMBER_ADOPT_UPSTREAM_PROGRAM_ID;
  const apply = process.env.SEPTEMBER_CAMPAIGN_APPLY === "1";
  const requestedActorEmail =
    process.env.YELP_RECONCILE_ACTOR_EMAIL ?? process.env.SEED_ADMIN_EMAIL;

  if (
    !businessId ||
    !campaignLayer ||
    !allowedLayers.has(campaignLayer) ||
    !mainProgramId
  ) {
    throw new Error(
      "Set YELP_INVENTORY_BUSINESS_ID, YELP_MAIN_PROGRAM_ID, and a supported SEPTEMBER_CAMPAIGN_LAYER.",
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

  const result = await reconcileSeptemberCampaignWorkflow(
    business.tenantId,
    platformActors[0]!.id,
    {
      businessId,
      campaignLayer,
      mainProgramId,
      adoptUpstreamProgramId,
      blockedKeywords: parseBlockedKeywords(),
      serviceTargetingConfirmed:
        process.env.SEPTEMBER_SERVICE_TARGETING_CONFIRMED === "1",
      dryRun: !apply,
      confirmation: apply ? "APPLY_APPROVED_SEPTEMBER_CAMPAIGN" : undefined,
    },
  );

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown reconciliation failure",
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
