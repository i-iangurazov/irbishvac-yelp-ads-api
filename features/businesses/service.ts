import "server-only";

import { findBusinessByEncryptedYelpBusinessId, getBusinessById, listBusinesses, upsertBusiness } from "@/lib/db/businesses-repository";
import { ensureYelpAccess, getCapabilityFlags } from "@/lib/yelp/runtime";
import { normalizeYelpCategories } from "@/lib/yelp/categories";
import { YelpBusinessMatchClient } from "@/lib/yelp/business-match-client";
import { YelpDataIngestionClient } from "@/lib/yelp/data-ingestion-client";
import { yelpBusinessMatchResponseSchema } from "@/lib/yelp/schemas";
import { businessSearchSchema, readinessPatchSchema } from "@/features/businesses/schemas";
import { recordAuditEvent } from "@/features/audit/service";

type ReadinessState = {
  hasAboutText: boolean;
  hasCategories: boolean;
  missingItems: string[];
  isReadyForCpc: boolean;
  adsEligibilityStatus: "UNKNOWN" | "ELIGIBLE" | "BLOCKED";
  adsEligibilityMessage?: string;
};

export function buildCpcReadiness(readinessJson: unknown, categoriesJson: unknown): ReadinessState {
  const categories = normalizeYelpCategories(categoriesJson);
  const readiness = typeof readinessJson === "object" && readinessJson !== null ? readinessJson : {};
  const persistedEligibilityStatus =
    typeof (readiness as Record<string, unknown>).adsEligibilityStatus === "string"
      ? ((readiness as Record<string, unknown>).adsEligibilityStatus as string)
      : undefined;
  const adsEligibilityBlocked =
    Boolean((readiness as Record<string, unknown>).adsEligibilityBlocked) || persistedEligibilityStatus === "INELIGIBLE";
  const adsEligibilityMessage =
    typeof (readiness as Record<string, unknown>).adsEligibilityMessage === "string"
      ? ((readiness as Record<string, unknown>).adsEligibilityMessage as string)
      : undefined;
  const adsEligibilityStatus =
    persistedEligibilityStatus === "ELIGIBLE" ? "ELIGIBLE" : adsEligibilityBlocked ? "BLOCKED" : "UNKNOWN";
  const hasAboutText = Boolean(
    (readiness as Record<string, unknown>).hasAboutText ?? (readiness as Record<string, unknown>).aboutThisBusiness
  );
  const hasCategories = categories.length > 0 || Boolean((readiness as Record<string, unknown>).hasCategories);
  const missingItems = [
    ...(adsEligibilityBlocked
      ? [adsEligibilityMessage ?? "This business is not eligible for Yelp Ads because Yelp marked it as an advertising-restricted category."]
      : []),
    ...(hasAboutText ? [] : ["Add specialties/about-this-business text"]),
    ...(hasCategories ? [] : ["Add at least one category"])
  ];

  return {
    hasAboutText,
    hasCategories,
    missingItems,
    isReadyForCpc: missingItems.length === 0,
    adsEligibilityStatus,
    adsEligibilityMessage
  };
}

export async function getBusinessesIndex(tenantId: string, search?: string) {
  const [businesses, capabilities] = await Promise.all([listBusinesses(tenantId, search), getCapabilityFlags(tenantId)]);

  return businesses.map((business) => ({
    ...business,
    categories: normalizeYelpCategories(business.categoriesJson),
    readiness: buildCpcReadiness(business.readinessJson, business.categoriesJson),
    capabilityState: {
      businessMatchApiEnabled: capabilities.businessMatchApiEnabled,
      dataIngestionApiEnabled: capabilities.dataIngestionApiEnabled
    }
  }));
}

export async function getBusinessDetail(tenantId: string, businessId: string) {
  const business = await getBusinessById(businessId, tenantId);

  return {
    ...business,
    categories: normalizeYelpCategories(business.categoriesJson),
    readiness: buildCpcReadiness(business.readinessJson, business.categoriesJson)
  };
}

export async function searchBusinessesForOnboarding(tenantId: string, input: unknown) {
  const data = businessSearchSchema.parse(input);
  const local = await listBusinesses(tenantId, data.query);

  try {
    const { credential } = await ensureYelpAccess({
      tenantId,
      capabilityKey: "businessMatchApiEnabled",
      credentialKind: "BUSINESS_MATCH"
    });
    const client = new YelpBusinessMatchClient(credential);
    const remote = await client.matchBusiness({
      name: data.query,
      location: data.location
    });
    const parsed = yelpBusinessMatchResponseSchema.parse(remote.data);

    return {
      local,
      remote: parsed.matches
    };
  } catch (error) {
    return {
      local,
      remote: [],
      remoteState: {
        message: error instanceof Error ? error.message : "Business Match API is unavailable."
      }
    };
  }
}

export async function saveBusinessRecord(
  tenantId: string,
  actorId: string,
  match: {
    source?: "manual" | "match";
    encrypted_business_id: string;
    name: string;
    city?: string;
    state?: string;
    country?: string;
    categories?: Array<string | { label: string; alias?: string }>;
    readiness?: {
      hasAboutText?: boolean;
      hasCategories?: boolean;
      missingItems?: string[];
    };
  }
) {
  const existing = await findBusinessByEncryptedYelpBusinessId(tenantId, match.encrypted_business_id);
  const existingReadiness =
    typeof existing?.readinessJson === "object" && existing.readinessJson !== null
      ? (existing.readinessJson as Record<string, unknown>)
      : {};
  const incomingReadiness = typeof match.readiness === "object" && match.readiness !== null ? match.readiness : {};

  const business = await upsertBusiness(tenantId, match.encrypted_business_id, {
    name: match.name,
    city: match.city ?? null,
    state: match.state ?? null,
    country: match.country ?? null,
    categoriesJson: normalizeYelpCategories(match.categories ?? []),
    readinessJson: {
      ...existingReadiness,
      ...incomingReadiness
    }
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: business.id,
    actionType: match.source === "match" ? "business.match.save" : "business.manual.save",
    status: "SUCCESS",
    after: business as never
  });

  return business;
}

export async function patchBusinessReadinessFields(tenantId: string, actorId: string, input: unknown) {
  const data = readinessPatchSchema.parse(input);
  const business = await getBusinessById(data.businessId, tenantId);
  const { credential } = await ensureYelpAccess({
    tenantId,
    capabilityKey: "dataIngestionApiEnabled",
    credentialKind: "DATA_INGESTION"
  });
  const client = new YelpDataIngestionClient(credential);

  await client.patchBusinessReadinessFields(business.encryptedYelpBusinessId, {
    specialties: data.specialties,
    categories: data.categories,
    aboutThisBusiness: data.aboutThisBusiness
  });

  await recordAuditEvent({
    tenantId,
    actorId,
    businessId: business.id,
    actionType: "business.readiness.patch",
    status: "SUCCESS",
    requestSummary: data as never
  });
}
