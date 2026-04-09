import "server-only";

import nodemailer from "nodemailer";

import { formatCurrency } from "@/lib/utils/format";
import { getServerEnv } from "@/lib/utils/env";

export type ReportDeliverySummary = {
  windowLabel: string;
  scopeLabel: string;
  dashboardUrl: string;
  totals: {
    yelpSpendCents: number;
    totalLeads: number;
    mappedLeads: number;
    active: number;
    contacted: number;
    booked: number;
    scheduled: number;
    jobInProgress: number;
    completed: number;
    won: number;
    lost: number;
    mappingRate: number;
    bookedRate: number;
    scheduledRate: number;
    completionRate: number;
    winRate: number;
    closeRate: number;
    costPerLeadCents: number | null;
    costPerBookedJobCents: number | null;
    costPerCompletedJobCents: number | null;
  };
  locationBreakdown: Array<{
    bucketId: string;
    bucketLabel: string;
    totalLeads: number;
    mappedLeads: number;
    active: number;
    contacted: number;
    booked: number;
    scheduled: number;
    jobInProgress: number;
    completed: number;
    won: number;
    lost: number;
    mappingRate: number;
    bookedRate: number;
    scheduledRate: number;
    completionRate: number;
    winRate: number;
    closeRate: number;
    yelpSpendCents: number;
  }>;
  serviceBreakdown: Array<{
    bucketId: string;
    bucketLabel: string;
    totalLeads: number;
    mappedLeads: number;
    active: number;
    contacted: number;
    booked: number;
    scheduled: number;
    jobInProgress: number;
    completed: number;
    won: number;
    lost: number;
    mappingRate: number;
    bookedRate: number;
    scheduledRate: number;
    completionRate: number;
    winRate: number;
    closeRate: number;
    yelpSpendCents: number;
  }>;
  sourceLabels: {
    yelp: string;
    internal: string;
  };
};

function nullishCurrency(value: number | null) {
  return value === null ? "n/a" : formatCurrency(value);
}

export function isSmtpConfigured() {
  const env = getServerEnv();
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM);
}

export function buildReportDeliveryCsv(summary: ReportDeliverySummary) {
  const rows: Array<Record<string, string | number>> = [
    {
      section: "summary",
      label: summary.scopeLabel,
      window: summary.windowLabel,
      yelpSpendCents: summary.totals.yelpSpendCents,
      totalLeads: summary.totals.totalLeads,
      mappedLeads: summary.totals.mappedLeads,
      active: summary.totals.active,
      contacted: summary.totals.contacted,
      booked: summary.totals.booked,
      scheduled: summary.totals.scheduled,
      jobInProgress: summary.totals.jobInProgress,
      completed: summary.totals.completed,
      won: summary.totals.won,
      lost: summary.totals.lost,
      mappingRatePct: summary.totals.mappingRate,
      bookedRatePct: summary.totals.bookedRate,
      scheduledRatePct: summary.totals.scheduledRate,
      completionRatePct: summary.totals.completionRate,
      winRatePct: summary.totals.winRate,
      closeRatePct: summary.totals.closeRate,
      derivedCostPerLeadCents: summary.totals.costPerLeadCents ?? "",
      derivedCostPerBookedLeadCents: summary.totals.costPerBookedJobCents ?? "",
      derivedCostPerCompletedJobCents: summary.totals.costPerCompletedJobCents ?? "",
      sourceYelp: summary.sourceLabels.yelp,
      sourceInternal: summary.sourceLabels.internal
    }
  ];

  for (const row of summary.locationBreakdown) {
    rows.push({
      section: "location_breakdown",
      label: row.bucketLabel,
      window: summary.windowLabel,
      yelpSpendCents: row.yelpSpendCents,
      totalLeads: row.totalLeads,
      mappedLeads: row.mappedLeads,
      active: row.active,
      contacted: row.contacted,
      booked: row.booked,
      scheduled: row.scheduled,
      jobInProgress: row.jobInProgress,
      completed: row.completed,
      won: row.won,
      lost: row.lost,
      mappingRatePct: row.mappingRate,
      bookedRatePct: row.bookedRate,
      scheduledRatePct: row.scheduledRate,
      completionRatePct: row.completionRate,
      winRatePct: row.winRate,
      closeRatePct: row.closeRate,
      derivedCostPerLeadCents: "",
      derivedCostPerBookedLeadCents: "",
      derivedCostPerCompletedJobCents: "",
      sourceYelp: summary.sourceLabels.yelp,
      sourceInternal: summary.sourceLabels.internal
    });
  }

  for (const row of summary.serviceBreakdown) {
    rows.push({
      section: "service_breakdown",
      label: row.bucketLabel,
      window: summary.windowLabel,
      yelpSpendCents: row.yelpSpendCents,
      totalLeads: row.totalLeads,
      mappedLeads: row.mappedLeads,
      active: row.active,
      contacted: row.contacted,
      booked: row.booked,
      scheduled: row.scheduled,
      jobInProgress: row.jobInProgress,
      completed: row.completed,
      won: row.won,
      lost: row.lost,
      mappingRatePct: row.mappingRate,
      bookedRatePct: row.bookedRate,
      scheduledRatePct: row.scheduledRate,
      completionRatePct: row.completionRate,
      winRatePct: row.winRate,
      closeRatePct: row.closeRate,
      derivedCostPerLeadCents: "",
      derivedCostPerBookedLeadCents: "",
      derivedCostPerCompletedJobCents: "",
      sourceYelp: summary.sourceLabels.yelp,
      sourceInternal: summary.sourceLabels.internal
    });
  }

  return rows;
}

export function buildReportDeliveryEmail(summary: ReportDeliverySummary) {
  const subject = `${summary.scopeLabel} Yelp report • ${summary.windowLabel}`;
  const text = [
    `${summary.scopeLabel}`,
    `Window: ${summary.windowLabel}`,
    "",
    `${summary.sourceLabels.yelp}: spend only, from delayed Yelp batch reporting.`,
    `${summary.sourceLabels.internal}: leads and outcomes derived from internal CRM mapping and status data.`,
    "",
    `Spend: ${formatCurrency(summary.totals.yelpSpendCents)}`,
    `Leads: ${summary.totals.totalLeads}`,
    `Mapped leads: ${summary.totals.mappedLeads}`,
    `Active: ${summary.totals.active}`,
    `Contacted: ${summary.totals.contacted}`,
    `Booked: ${summary.totals.booked}`,
    `Scheduled: ${summary.totals.scheduled}`,
    `Job in progress: ${summary.totals.jobInProgress}`,
    `Completed: ${summary.totals.completed}`,
    `Won: ${summary.totals.won}`,
    `Lost: ${summary.totals.lost}`,
    `Mapping rate: ${summary.totals.mappingRate}%`,
    `Booked rate: ${summary.totals.bookedRate}%`,
    `Scheduled rate: ${summary.totals.scheduledRate}%`,
    `Completion rate: ${summary.totals.completionRate}%`,
    `Win rate: ${summary.totals.winRate}%`,
    `Close rate: ${summary.totals.closeRate}%`,
    `Cost per lead: ${nullishCurrency(summary.totals.costPerLeadCents)}`,
    `Cost per booked lead: ${nullishCurrency(summary.totals.costPerBookedJobCents)}`,
    `Cost per completed job: ${nullishCurrency(summary.totals.costPerCompletedJobCents)}`,
    "",
    `Dashboard link: ${summary.dashboardUrl}`
  ].join("\n");
  const topLocations = summary.locationBreakdown.slice(0, 5);
  const topServices = summary.serviceBreakdown.slice(0, 5);
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827">
      <h2 style="margin:0 0 8px">${summary.scopeLabel}</h2>
      <p style="margin:0 0 16px">Window: ${summary.windowLabel}</p>
      <p style="margin:0 0 6px"><strong>${summary.sourceLabels.yelp}</strong>: spend only, from delayed Yelp batch reporting.</p>
      <p style="margin:0 0 18px"><strong>${summary.sourceLabels.internal}</strong>: leads and outcomes derived from internal CRM mapping and status data.</p>
      <table style="border-collapse:collapse;width:100%;margin-bottom:18px">
        <tbody>
          <tr><td style="padding:6px 0"><strong>Spend</strong></td><td style="padding:6px 0">${formatCurrency(summary.totals.yelpSpendCents)}</td></tr>
          <tr><td style="padding:6px 0"><strong>Leads</strong></td><td style="padding:6px 0">${summary.totals.totalLeads}</td></tr>
          <tr><td style="padding:6px 0"><strong>Mapped leads</strong></td><td style="padding:6px 0">${summary.totals.mappedLeads}</td></tr>
          <tr><td style="padding:6px 0"><strong>Active</strong></td><td style="padding:6px 0">${summary.totals.active}</td></tr>
          <tr><td style="padding:6px 0"><strong>Contacted</strong></td><td style="padding:6px 0">${summary.totals.contacted}</td></tr>
          <tr><td style="padding:6px 0"><strong>Booked</strong></td><td style="padding:6px 0">${summary.totals.booked}</td></tr>
          <tr><td style="padding:6px 0"><strong>Scheduled</strong></td><td style="padding:6px 0">${summary.totals.scheduled}</td></tr>
          <tr><td style="padding:6px 0"><strong>Job in progress</strong></td><td style="padding:6px 0">${summary.totals.jobInProgress}</td></tr>
          <tr><td style="padding:6px 0"><strong>Completed</strong></td><td style="padding:6px 0">${summary.totals.completed}</td></tr>
          <tr><td style="padding:6px 0"><strong>Won</strong></td><td style="padding:6px 0">${summary.totals.won}</td></tr>
          <tr><td style="padding:6px 0"><strong>Lost</strong></td><td style="padding:6px 0">${summary.totals.lost}</td></tr>
          <tr><td style="padding:6px 0"><strong>Booked rate</strong></td><td style="padding:6px 0">${summary.totals.bookedRate}%</td></tr>
          <tr><td style="padding:6px 0"><strong>Completion rate</strong></td><td style="padding:6px 0">${summary.totals.completionRate}%</td></tr>
          <tr><td style="padding:6px 0"><strong>Win rate</strong></td><td style="padding:6px 0">${summary.totals.winRate}%</td></tr>
          <tr><td style="padding:6px 0"><strong>Close rate</strong></td><td style="padding:6px 0">${summary.totals.closeRate}%</td></tr>
          <tr><td style="padding:6px 0"><strong>Cost per lead</strong></td><td style="padding:6px 0">${nullishCurrency(summary.totals.costPerLeadCents)}</td></tr>
          <tr><td style="padding:6px 0"><strong>Cost per booked lead</strong></td><td style="padding:6px 0">${nullishCurrency(summary.totals.costPerBookedJobCents)}</td></tr>
        </tbody>
      </table>
      <h3 style="margin:18px 0 8px">Top location rows</h3>
      <ul style="padding-left:18px;margin:0 0 16px">
        ${topLocations.map((row) => `<li>${row.bucketLabel}: ${row.totalLeads} leads, ${formatCurrency(row.yelpSpendCents)} spend, ${row.completed} completed</li>`).join("")}
      </ul>
      <h3 style="margin:18px 0 8px">Top service rows</h3>
      <ul style="padding-left:18px;margin:0 0 16px">
        ${topServices.map((row) => `<li>${row.bucketLabel}: ${row.totalLeads} leads, ${formatCurrency(row.yelpSpendCents)} spend, ${row.completed} completed</li>`).join("")}
      </ul>
      <p style="margin:0"><a href="${summary.dashboardUrl}">Open in dashboard</a></p>
    </div>
  `;

  return {
    subject,
    text,
    html
  };
}

export async function sendScheduledReportEmail(params: {
  to: string[];
  subject: string;
  text: string;
  html: string;
  attachmentFilename: string;
  attachmentContent: string;
}) {
  const env = getServerEnv();

  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_FROM) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, and SMTP_FROM before enabling delivery.");
  }

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    auth: env.SMTP_USER
      ? {
          user: env.SMTP_USER,
          pass: env.SMTP_PASSWORD
        }
      : undefined
  });

  return transport.sendMail({
    from: env.SMTP_FROM,
    replyTo: env.SMTP_REPLY_TO,
    to: params.to.join(", "),
    subject: params.subject,
    text: params.text,
    html: params.html,
    attachments: [
      {
        filename: params.attachmentFilename,
        content: params.attachmentContent,
        contentType: "text/csv"
      }
    ]
  });
}
