import { loadEnvFile } from "node:process";
import { PrismaClient, CredentialKind, ProgramStatus, ProgramType, ReportGranularity, ReportStatus, RoleCode } from "@prisma/client";
import bcrypt from "bcryptjs";

loadEnvFile(".env");

const prisma = new PrismaClient();

const defaultPermissions = {
  ADMIN: ["*"],
  OPERATOR: [
    "businesses:read",
    "businesses:write",
    "programs:read",
    "programs:write",
    "programs:terminate",
    "features:read",
    "features:write",
    "leads:read",
    "leads:write",
    "reports:read",
    "reports:request",
    "locations:read",
    "services:read",
    "integrations:read",
    "sync:read",
    "sync:retry",
    "audit:read"
  ],
  ANALYST: [
    "businesses:read",
    "programs:read",
    "features:read",
    "leads:read",
    "reports:read",
    "reports:request",
    "locations:read",
    "services:read",
    "integrations:read",
    "sync:read",
    "audit:read"
  ],
  VIEWER: [
    "businesses:read",
    "programs:read",
    "features:read",
    "leads:read",
    "reports:read",
    "locations:read",
    "services:read",
    "integrations:read",
    "sync:read",
    "audit:read"
  ]
};

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "default" },
    update: {},
    create: {
      name: "Default Tenant",
      slug: "default"
    }
  });

  const roles = await Promise.all(
    Object.entries(defaultPermissions).map(([code, permissions]) =>
      prisma.role.upsert({
        where: { code: code as RoleCode },
        update: {
          name: code.charAt(0) + code.slice(1).toLowerCase(),
          description: `${code} role`,
          permissionsJson: permissions
        },
        create: {
          code: code as RoleCode,
          name: code.charAt(0) + code.slice(1).toLowerCase(),
          description: `${code} role`,
          permissionsJson: permissions
        }
      })
    )
  );

  const roleMap = Object.fromEntries(roles.map((role) => [role.code, role.id]));
  const defaultEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase() || "admin@yelp-console.local";
  const defaultName = process.env.SEED_ADMIN_NAME?.trim() || "Admin User";
  const defaultPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

  if (process.env.NODE_ENV === "production" && (!process.env.SEED_ADMIN_PASSWORD || defaultPassword === "ChangeMe123!")) {
    throw new Error("SEED_ADMIN_PASSWORD must be explicitly set to a strong value before running the seed in production.");
  }

  const passwordHash = await bcrypt.hash(defaultPassword, 12);

  await prisma.user.upsert({
    where: { email: defaultEmail },
    update: {
      name: defaultName,
      passwordHash,
      tenantId: tenant.id,
      roleId: roleMap.ADMIN
    },
    create: {
      email: defaultEmail,
      name: defaultName,
      passwordHash,
      tenantId: tenant.id,
      roleId: roleMap.ADMIN
    }
  });

  await prisma.systemSetting.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: "yelpCapabilities" } },
    update: {
      valueJson: {
        hasAdsApi: false,
        hasLeadsApi: false,
        hasReportingApi: false,
        hasConversionsApi: false,
        hasPartnerSupportApi: false,
        hasCrmIntegration: false,
        adsApiEnabled: false,
        programFeatureApiEnabled: false,
        reportingApiEnabled: false,
        dataIngestionApiEnabled: false,
        businessMatchApiEnabled: false,
        demoModeEnabled: process.env.DEMO_MODE === "true"
      }
    },
    create: {
      tenantId: tenant.id,
      key: "yelpCapabilities",
      valueJson: {
        hasAdsApi: false,
        hasLeadsApi: false,
        hasReportingApi: false,
        hasConversionsApi: false,
        hasPartnerSupportApi: false,
        hasCrmIntegration: false,
        adsApiEnabled: false,
        programFeatureApiEnabled: false,
        reportingApiEnabled: false,
        dataIngestionApiEnabled: false,
        businessMatchApiEnabled: false,
        demoModeEnabled: process.env.DEMO_MODE === "true"
      }
    }
  });

  if (process.env.DEMO_MODE !== "true") {
    return;
  }

  const business = await prisma.business.upsert({
    where: {
      tenantId_encryptedYelpBusinessId: {
        tenantId: tenant.id,
        encryptedYelpBusinessId: "enc_demo_business_001"
      }
    },
    update: {
      name: "Northwind HVAC",
      city: "San Francisco",
      state: "CA",
      country: "US",
      categoriesJson: ["Heating & Air Conditioning/HVAC", "Water Heater Installation/Repair"],
      readinessJson: {
        hasAboutText: true,
        hasCategories: true,
        missingItems: []
      }
    },
    create: {
      tenantId: tenant.id,
      name: "Northwind HVAC",
      encryptedYelpBusinessId: "enc_demo_business_001",
      city: "San Francisco",
      state: "CA",
      country: "US",
      categoriesJson: ["Heating & Air Conditioning/HVAC", "Water Heater Installation/Repair"],
      readinessJson: {
        hasAboutText: true,
        hasCategories: true,
        missingItems: []
      }
    }
  });

  const location = await prisma.location.upsert({
    where: {
      tenantId_externalCrmLocationId: {
        tenantId: tenant.id,
        externalCrmLocationId: "st_location_sf_001"
      }
    },
    update: {
      name: "San Francisco Dispatch",
      code: "SF",
      city: "San Francisco",
      state: "CA",
      country: "US",
      timezone: "America/Los_Angeles"
    },
    create: {
      tenantId: tenant.id,
      name: "San Francisco Dispatch",
      code: "SF",
      externalCrmLocationId: "st_location_sf_001",
      city: "San Francisco",
      state: "CA",
      country: "US",
      timezone: "America/Los_Angeles"
    }
  });

  await prisma.business.update({
    where: { id: business.id },
    data: {
      locationId: location.id
    }
  });

  await prisma.serviceCategory.upsert({
    where: {
      tenantId_slug: {
        tenantId: tenant.id,
        slug: "hvac-repair"
      }
    },
    update: {
      name: "HVAC Repair",
      yelpAliasesJson: ["heatingairconditioninghvac", "waterheaterinstallrepair"],
      crmCodesJson: ["HVAC_REPAIR"]
    },
    create: {
      tenantId: tenant.id,
      slug: "hvac-repair",
      name: "HVAC Repair",
      yelpAliasesJson: ["heatingairconditioninghvac", "waterheaterinstallrepair"],
      crmCodesJson: ["HVAC_REPAIR"]
    }
  });

  const program = await prisma.program.upsert({
    where: { id: "demo-program-cpc" },
    update: {
      tenantId: tenant.id,
      businessId: business.id,
      type: ProgramType.CPC,
      status: ProgramStatus.ACTIVE,
      currency: "USD",
      budgetCents: 250000,
      maxBidCents: 2200,
      isAutobid: false,
      pacingMethod: "STANDARD",
      feePeriod: "MONTHLY",
      adCategoriesJson: ["Heating & Air Conditioning/HVAC"],
      configurationJson: {
        scheduledBudgetChange: {
          effectiveDate: "2026-04-01",
          budgetCents: 275000
        }
      }
    },
    create: {
      id: "demo-program-cpc",
      tenantId: tenant.id,
      businessId: business.id,
      type: ProgramType.CPC,
      status: ProgramStatus.ACTIVE,
      currency: "USD",
      budgetCents: 250000,
      maxBidCents: 2200,
      isAutobid: false,
      pacingMethod: "STANDARD",
      feePeriod: "MONTHLY",
      adCategoriesJson: ["Heating & Air Conditioning/HVAC"],
      configurationJson: {
        scheduledBudgetChange: {
          effectiveDate: "2026-04-01",
          budgetCents: 275000
        }
      }
    }
  });

  await prisma.programFeatureSnapshot.createMany({
    data: [
      {
        tenantId: tenant.id,
        businessId: business.id,
        programId: program.id,
        type: "LINK_TRACKING",
        valueJson: {
          destinationUrl: "https://northwindhvac.example/offer",
          trackingTemplate: "https://tracking.example/click?src=yelp"
        }
      },
      {
        tenantId: tenant.id,
        businessId: business.id,
        programId: program.id,
        type: "NEGATIVE_KEYWORD_TARGETING",
        valueJson: {
          keywords: ["jobs", "careers"]
        }
      }
    ],
    skipDuplicates: true
  });

  const reportRequest = await prisma.reportRequest.upsert({
    where: { id: "demo-report-request" },
    update: {
      tenantId: tenant.id,
      businessId: business.id,
      granularity: ReportGranularity.DAILY,
      status: ReportStatus.READY,
      startDate: new Date("2026-03-01"),
      endDate: new Date("2026-03-07"),
      requestedBusinessIdsJson: [business.id]
    },
    create: {
      id: "demo-report-request",
      tenantId: tenant.id,
      businessId: business.id,
      granularity: ReportGranularity.DAILY,
      status: ReportStatus.READY,
      startDate: new Date("2026-03-01"),
      endDate: new Date("2026-03-07"),
      requestedBusinessIdsJson: [business.id]
    }
  });

  await prisma.reportResult.upsert({
    where: { cacheKey: `demo:${reportRequest.id}:${business.id}` },
    update: {
      tenantId: tenant.id,
      reportRequestId: reportRequest.id,
      businessId: business.id,
      granularity: ReportGranularity.DAILY,
      payloadJson: {
        totals: {
          impressions: 4200,
          clicks: 290,
          adSpendCents: 128900,
          calls: 42,
          websiteLeads: 18
        },
        rows: [
          { date: "2026-03-01", impressions: 600, clicks: 44, adSpendCents: 18000, calls: 5, websiteLeads: 3 },
          { date: "2026-03-02", impressions: 575, clicks: 37, adSpendCents: 17400, calls: 4, websiteLeads: 2 },
          { date: "2026-03-03", impressions: 640, clicks: 45, adSpendCents: 19200, calls: 6, websiteLeads: 3 }
        ]
      },
      metricsSummaryJson: {
        ctr: 0.069,
        cpcCents: 444
      }
    },
    create: {
      tenantId: tenant.id,
      reportRequestId: reportRequest.id,
      businessId: business.id,
      granularity: ReportGranularity.DAILY,
      cacheKey: `demo:${reportRequest.id}:${business.id}`,
      payloadJson: {
        totals: {
          impressions: 4200,
          clicks: 290,
          adSpendCents: 128900,
          calls: 42,
          websiteLeads: 18
        },
        rows: [
          { date: "2026-03-01", impressions: 600, clicks: 44, adSpendCents: 18000, calls: 5, websiteLeads: 3 },
          { date: "2026-03-02", impressions: 575, clicks: 37, adSpendCents: 17400, calls: 4, websiteLeads: 2 },
          { date: "2026-03-03", impressions: 640, clicks: 45, adSpendCents: 19200, calls: 6, websiteLeads: 3 }
        ]
      },
      metricsSummaryJson: {
        ctr: 0.069,
        cpcCents: 444
      }
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
