import { reconcileTemporaryAugustCampaignWorkflow } from "../features/ads-programs/service";
import { prisma } from "../lib/db/prisma";

const allowedLayers = new Set([
  "AUGUST_PLUMBING_TEMP",
  "AUGUST_COMMERCIAL_HVAC_TEMP",
]);

async function main() {
  const businessId = process.env.YELP_INVENTORY_BUSINESS_ID;
  const campaignLayer = process.env.TEMPORARY_CAMPAIGN_LAYER;
  const apply = process.env.TEMPORARY_CAMPAIGN_APPLY === "1";
  const requestedActorEmail =
    process.env.YELP_RECONCILE_ACTOR_EMAIL ?? process.env.SEED_ADMIN_EMAIL;

  if (!businessId || !campaignLayer || !allowedLayers.has(campaignLayer)) {
    throw new Error(
      "Set YELP_INVENTORY_BUSINESS_ID and a supported TEMPORARY_CAMPAIGN_LAYER.",
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

  const result = await reconcileTemporaryAugustCampaignWorkflow(
    business.tenantId,
    platformActors[0]!.id,
    {
      businessId,
      campaignLayer,
      dryRun: !apply,
      confirmation: apply ? "APPLY_APPROVED_TEMPORARY_CAMPAIGN" : undefined,
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
