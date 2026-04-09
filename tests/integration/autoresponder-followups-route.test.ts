import { describe, expect, it, vi } from "vitest";

const runLeadAutomationFollowUpWorker = vi.fn();

vi.mock("@/lib/utils/http", () => ({
  requireCronAuthorization: vi.fn(() => null),
  handleRouteError: vi.fn((error) => {
    throw error;
  })
}));

vi.mock("@/features/autoresponder/service", () => ({
  runLeadAutomationFollowUpWorker
}));

describe("autoresponder follow-up worker route", () => {
  it("runs the dedicated follow-up worker with a bounded limit", async () => {
    runLeadAutomationFollowUpWorker.mockResolvedValueOnce([
      {
        attemptId: "attempt_1",
        leadId: "lead_1",
        cadence: "FOLLOW_UP_24H",
        status: "SENT"
      }
    ]);

    const { GET } = await import("@/app/api/internal/autoresponder/followups/route");
    const response = await GET(new Request("http://localhost/api/internal/autoresponder/followups?limit=250"));

    expect(response.status).toBe(200);
    expect(runLeadAutomationFollowUpWorker).toHaveBeenCalledWith(100);
  });
});
