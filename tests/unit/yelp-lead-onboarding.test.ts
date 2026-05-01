import { describe, expect, it } from "vitest";

import { buildYelpLeadOnboardingState } from "@/features/businesses/yelp-lead-onboarding";

describe("buildYelpLeadOnboardingState", () => {
  it("blocks setup when the local Yelp business ID is missing", () => {
    const state = buildYelpLeadOnboardingState({
      encryptedYelpBusinessId: null,
      hasLeadsApi: true,
      leadCount: 0,
      autoresponderEnabled: false,
      conversationAutomationEnabled: false,
      hasBusinessOverride: false
    });

    expect(state.status).toBe("FAILED");
    expect(state.nextAction).toContain("Save the Yelp encrypted business ID");
    expect(state.steps.find((step) => step.id === "local-yelp-business")?.status).toBe("FAILED");
  });

  it("treats webhook, sync, and effective tenant-default automation as live-ready", () => {
    const state = buildYelpLeadOnboardingState({
      encryptedYelpBusinessId: "SNa1ugk6DNIuvIPu8-AiGA",
      hasLeadsApi: true,
      latestLead: {
        latestWebhookReceivedAt: new Date("2026-04-20T12:00:00.000Z"),
        latestWebhookStatus: "COMPLETED",
        lastSyncedAt: new Date("2026-04-20T12:01:00.000Z"),
        latestInteractionAt: new Date("2026-04-20T12:00:00.000Z")
      },
      latestLeadSyncRun: {
        type: "YELP_LEADS_BACKFILL",
        status: "COMPLETED",
        lastSuccessfulSyncAt: new Date("2026-04-20T12:01:00.000Z")
      },
      leadCount: 35,
      autoresponderEnabled: true,
      conversationAutomationEnabled: true,
      hasBusinessOverride: false,
      forwarderAllowlist: {
        status: "READY",
        label: "Allowed",
        detail: "Allowlisted"
      }
    });

    expect(state.status).toBe("ACTIVE");
    expect(state.steps.find((step) => step.id === "business-admin-access")?.status).toBe("READY");
    expect(state.steps.find((step) => step.id === "webhook-forwarder-allowlist")?.status).toBe("READY");
    expect(state.steps.find((step) => step.id === "webhook-subscription")?.status).toBe("READY");
    expect(state.steps.find((step) => step.id === "autoresponder-scope")?.value).toBe("Tenant default");
  });

  it("keeps intake readiness separate from disabled autoresponder scope", () => {
    const state = buildYelpLeadOnboardingState({
      encryptedYelpBusinessId: "ys4FVTHxbSepIkvCLHYxCA",
      hasLeadsApi: true,
      readinessJson: { yelpLeadSubscriptionConfirmed: true },
      latestLeadSyncRun: {
        type: "YELP_LEADS_BACKFILL",
        status: "COMPLETED"
      },
      leadCount: 12,
      autoresponderEnabled: false,
      conversationAutomationEnabled: false,
      hasBusinessOverride: false
    });

    expect(state.status).toBe("INACTIVE");
    expect(state.label).toContain("automation off");
    expect(state.steps.find((step) => step.id === "autoresponder-scope")?.status).toBe("INACTIVE");
  });

  it("shows accepted async subscription requests as processing until verified", () => {
    const state = buildYelpLeadOnboardingState({
      encryptedYelpBusinessId: "SNa1ugk6DNIuvIPu8-AiGA",
      hasLeadsApi: true,
      readinessJson: { yelpLeadSubscriptionStatus: "REQUESTED" },
      leadCount: 0,
      autoresponderEnabled: false,
      conversationAutomationEnabled: false,
      hasBusinessOverride: false
    });

    const webhookStep = state.steps.find((step) => step.id === "webhook-subscription");

    expect(state.status).toBe("UNKNOWN");
    expect(webhookStep?.status).toBe("PROCESSING");
    expect(webhookStep?.value).toBe("Requested");
  });

  it("blocks onboarding when the mirrored forwarder allowlist excludes the business", () => {
    const state = buildYelpLeadOnboardingState({
      encryptedYelpBusinessId: "SNa1ugk6DNIuvIPu8-AiGA",
      hasLeadsApi: true,
      readinessJson: { yelpLeadSubscriptionStatus: "REQUESTED" },
      leadCount: 0,
      autoresponderEnabled: true,
      conversationAutomationEnabled: true,
      hasBusinessOverride: true,
      forwarderAllowlist: {
        status: "FAILED",
        label: "Not allowed",
        detail: "Missing from allowlist"
      }
    });

    expect(state.status).toBe("FAILED");
    expect(state.label).toBe("Forwarder allowlist missing");
    expect(state.steps.find((step) => step.id === "webhook-forwarder-allowlist")?.status).toBe("FAILED");
  });

  it("surfaces failed webhook proof as a blocking onboarding state", () => {
    const state = buildYelpLeadOnboardingState({
      encryptedYelpBusinessId: "SNa1ugk6DNIuvIPu8-AiGA",
      hasLeadsApi: true,
      latestLead: {
        latestWebhookReceivedAt: new Date("2026-04-20T12:00:00.000Z"),
        latestWebhookStatus: "FAILED"
      },
      leadCount: 0,
      autoresponderEnabled: true,
      conversationAutomationEnabled: true,
      hasBusinessOverride: true
    });

    expect(state.status).toBe("FAILED");
    expect(state.label).toBe("Webhook intake failed");
    expect(state.steps.find((step) => step.id === "webhook-subscription")?.status).toBe("FAILED");
  });
});
