import { beforeEach, describe, expect, it, vi } from "vitest";

const getLeadRecordById = vi.fn();
const createLeadConversationAction = vi.fn();
const updateLeadConversationAction = vi.fn();
const ensureYelpLeadsAccess = vi.fn();
const writeLeadEvent = vi.fn();
const markLeadEventAsRead = vi.fn();
const markLeadAsReplied = vi.fn();
const sendLeadAutomationEmail = vi.fn();
const recordAuditEvent = vi.fn();
const syncLeadSnapshotFromYelp = vi.fn();
const logInfo = vi.fn();
const logError = vi.fn();
const isSmtpConfigured = vi.fn();

vi.mock("@/lib/db/leads-repository", () => ({
  getLeadRecordById
}));

vi.mock("@/lib/db/lead-messaging-repository", () => ({
  createLeadConversationAction,
  updateLeadConversationAction
}));

vi.mock("@/lib/yelp/runtime", () => ({
  ensureYelpLeadsAccess
}));

vi.mock("@/lib/yelp/leads-client", () => ({
  YelpLeadsClient: vi.fn().mockImplementation(() => ({
    writeLeadEvent,
    markLeadEventAsRead,
    markLeadAsReplied
  }))
}));

vi.mock("@/features/autoresponder/email", () => ({
  sendLeadAutomationEmail
}));

vi.mock("@/features/audit/service", () => ({
  recordAuditEvent
}));

vi.mock("@/features/leads/yelp-sync", () => ({
  syncLeadSnapshotFromYelp,
  extractLeadIdsResponse: vi.fn()
}));

vi.mock("@/lib/utils/logging", () => ({
  logInfo,
  logError
}));

vi.mock("@/features/report-delivery/email", () => ({
  isSmtpConfigured
}));

const baseLead = {
  id: "lead_local_1",
  tenantId: "tenant_1",
  businessId: "business_1",
  locationId: "location_1",
  externalLeadId: "lead_ext_1",
  externalBusinessId: "ys4FVTHxbSepIkvCLHYxCA",
  customerName: "Jane Doe",
  customerEmail: "[email protected]",
  business: {
    id: "business_1",
    name: "Northwind HVAC",
    locationId: "location_1",
    encryptedYelpBusinessId: "ys4FVTHxbSepIkvCLHYxCA"
  },
  events: [
    {
      eventKey: "evt_1",
      externalEventId: "evt_yelp_1",
      eventType: "INQUIRY",
      occurredAt: new Date("2026-04-03T09:00:00.000Z"),
      isRead: true,
      isReply: false
    },
    {
      eventKey: "evt_2",
      externalEventId: "evt_yelp_2",
      eventType: "INQUIRY",
      occurredAt: new Date("2026-04-03T10:00:00.000Z"),
      isRead: false,
      isReply: false
    }
  ],
  conversationActions: []
};

describe("lead messaging service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getLeadRecordById.mockResolvedValue(baseLead);
    ensureYelpLeadsAccess.mockResolvedValue({
      credential: {
        baseUrl: "https://api.yelp.com",
        secret: "token"
      }
    });
    syncLeadSnapshotFromYelp.mockResolvedValue({});
    isSmtpConfigured.mockReturnValue(true);
  });

  it("posts an operator reply into the Yelp thread", async () => {
    createLeadConversationAction.mockResolvedValue({
      id: "action_1"
    });
    updateLeadConversationAction.mockResolvedValue({
      id: "action_1",
      status: "SENT"
    });
    writeLeadEvent.mockResolvedValue({
      correlationId: "corr_1",
      data: null
    });

    const { sendLeadReplyWorkflow } = await import("@/features/leads/messaging-service");
    const result = await sendLeadReplyWorkflow("tenant_1", "user_1", "lead_local_1", {
      channel: "YELP_THREAD",
      body: "Hi, thanks for contacting us."
    });

    expect(writeLeadEvent).toHaveBeenCalledWith("lead_ext_1", {
      request_content: "Hi, thanks for contacting us.",
      request_type: "TEXT"
    });
    expect(result).toMatchObject({
      status: "SENT",
      channel: "YELP_THREAD"
    });
  });

  it("sends an external email reply and marks the lead replied on Yelp", async () => {
    createLeadConversationAction
      .mockResolvedValueOnce({ id: "action_send_1" })
      .mockResolvedValueOnce({ id: "action_mark_1" });
    updateLeadConversationAction
      .mockResolvedValueOnce({ id: "action_send_1", status: "SENT" })
      .mockResolvedValueOnce({ id: "action_mark_1", status: "SENT" });
    sendLeadAutomationEmail.mockResolvedValue({
      messageId: "email_1",
      accepted: ["[email protected]"],
      rejected: [],
      response: "250 queued"
    });
    markLeadAsReplied.mockResolvedValue({
      correlationId: "corr_reply_1",
      data: null
    });

    const { sendLeadReplyWorkflow } = await import("@/features/leads/messaging-service");
    const result = await sendLeadReplyWorkflow("tenant_1", "user_1", "lead_local_1", {
      channel: "EMAIL",
      subject: "Thanks for reaching out",
      body: "We received your Yelp request."
    });

    expect(sendLeadAutomationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "[email protected]",
        subject: "Thanks for reaching out",
        text: "We received your Yelp request."
      })
    );
    expect(markLeadAsReplied).toHaveBeenCalledWith("lead_ext_1", {
      reply_type: "EMAIL"
    });
    expect(result).toMatchObject({
      status: "SENT",
      channel: "EMAIL"
    });
  });

  it("marks the latest unread Yelp event as read", async () => {
    createLeadConversationAction.mockResolvedValue({
      id: "action_read_1"
    });
    updateLeadConversationAction.mockResolvedValue({
      id: "action_read_1",
      status: "SENT"
    });
    markLeadEventAsRead.mockResolvedValue({
      correlationId: "corr_read_1",
      data: null
    });

    const { markLeadAsReadWorkflow } = await import("@/features/leads/messaging-service");
    const result = await markLeadAsReadWorkflow("tenant_1", "user_1", "lead_local_1");

    expect(markLeadEventAsRead).toHaveBeenCalledWith("lead_ext_1", {
      event_id: "evt_yelp_2",
      time_read: expect.any(String)
    });
    expect(result).toMatchObject({
      status: "SENT"
    });
  });

  it("falls back to external email when Yelp-thread delivery is unavailable for automation", async () => {
    const { YelpMissingAccessError } = await import("@/lib/yelp/errors");

    createLeadConversationAction
      .mockResolvedValueOnce({ id: "action_thread_1" })
      .mockResolvedValueOnce({ id: "action_email_1" })
      .mockResolvedValueOnce({ id: "action_mark_1" });
    updateLeadConversationAction
      .mockResolvedValueOnce({ id: "action_thread_1", status: "FAILED" })
      .mockResolvedValueOnce({ id: "action_email_1", status: "SENT" })
      .mockResolvedValueOnce({ id: "action_mark_1", status: "SENT" });
    writeLeadEvent.mockRejectedValue(
      new YelpMissingAccessError("The current Yelp account does not have access to this capability.")
    );
    sendLeadAutomationEmail.mockResolvedValue({
      messageId: "email_1",
      accepted: ["[email protected]"],
      rejected: [],
      response: "250 queued"
    });
    markLeadAsReplied.mockResolvedValue({
      correlationId: "corr_reply_1",
      data: null
    });

    const { deliverLeadAutomationMessage } = await import("@/features/leads/messaging-service");
    const result = await deliverLeadAutomationMessage({
      tenantId: "tenant_1",
      leadId: "lead_local_1",
      automationAttemptId: "attempt_1",
      channel: "YELP_THREAD",
      renderedSubject: "Thanks for contacting Northwind HVAC",
      renderedBody: "We received your request.",
      recipient: null
    });

    expect(writeLeadEvent).toHaveBeenCalledTimes(1);
    expect(sendLeadAutomationEmail).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "SENT",
      deliveryChannel: "EMAIL"
    });
  });
});
