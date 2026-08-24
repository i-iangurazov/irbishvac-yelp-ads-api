import { prisma } from "../lib/db/prisma";
import { getServerEnv } from "../lib/utils/env";
import { normalizeUnknownError } from "../lib/yelp/errors";
import { YelpLeadsClient } from "../lib/yelp/leads-client";
import {
  ensureYelpLeadsAccess,
  getCredentialConfig,
} from "../lib/yelp/runtime";

const endpointTemplate = "/v3/businesses/{businessId}/lead_ids";
let credentialSource = "NOT_RESOLVED";

async function main() {
  const requestedBusinessId = process.env.YELP_INVENTORY_BUSINESS_ID;
  const businesses = await prisma.business.findMany({
    where: {
      ...(requestedBusinessId ? { id: requestedBusinessId } : {}),
      programs: {
        some: {
          type: "CPC",
          status: {
            in: ["DRAFT", "QUEUED", "PROCESSING", "ACTIVE", "SCHEDULED"],
          },
        },
      },
    },
    select: {
      tenantId: true,
      encryptedYelpBusinessId: true,
    },
  });

  if (businesses.length !== 1) {
    console.log(
      JSON.stringify({
        ok: false,
        endpointTemplate,
        status: null,
        category: "AMBIGUOUS_BUSINESS_SCOPE",
        matchedBusinessCount: businesses.length,
      }),
    );
    process.exitCode = 2;
    return;
  }

  const business = businesses[0]!;
  const savedCredential = await getCredentialConfig(
    business.tenantId,
    "REPORTING_FUSION",
  );
  const env = getServerEnv();
  credentialSource =
    savedCredential?.isEnabled && Boolean(savedCredential.secret)
      ? "TENANT_REPORTING_FUSION"
      : env.YELP_ACCESS_TOKEN
        ? "ENV_YELP_ACCESS_TOKEN"
        : env.YELP_API_KEY
          ? "ENV_YELP_API_KEY"
          : "MISSING";
  const { credential } = await ensureYelpLeadsAccess(business.tenantId);
  const response = await new YelpLeadsClient(credential).getBusinessLeadIds(
    business.encryptedYelpBusinessId,
    { limit: 1, offset: 0 },
  );
  const leadIds = Array.isArray(response.data)
    ? response.data
    : response.data.lead_ids;
  const hasMore = Array.isArray(response.data)
    ? false
    : (response.data.has_more ?? false);

  console.log(
    JSON.stringify({
      ok: true,
      endpointTemplate,
      status: 200,
      category: "SUCCESS",
      credentialSource,
      returnedLeadCount: leadIds.length,
      hasMore,
    }),
  );
}

main()
  .catch((error) => {
    const normalized = normalizeUnknownError(error);
    console.log(
      JSON.stringify({
        ok: false,
        endpointTemplate,
        status: normalized.status,
        category: normalized.code,
        credentialSource,
        message: normalized.message,
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
