export type ReportPayload = {
  totals?: Record<string, number>;
  rows?: Array<Record<string, string | number | null>>;
};

export type ReportPayloadSource = {
  businessId?: string | null;
  business?: {
    name?: string | null;
  } | null;
  payloadJson?: unknown;
};

export function buildCombinedReportPayload(report: { results: ReportPayloadSource[] }) {
  return report.results.reduce<Required<ReportPayload>>(
    (combined, result) => {
      const payload = (result.payloadJson as ReportPayload | null) ?? {};
      const totals = payload.totals ?? {};
      const rows = payload.rows ?? [];

      for (const [key, value] of Object.entries(totals)) {
        const currentValue = typeof combined.totals[key] === "number" ? combined.totals[key] : 0;
        combined.totals[key] = currentValue + (typeof value === "number" ? value : 0);
      }

      const decoratedRows = rows.map((row) =>
        report.results.length > 1
          ? {
              businessId: result.businessId ?? "",
              businessName: result.business?.name ?? "",
              ...row
            }
          : row
      );
      combined.rows.push(...decoratedRows);

      return combined;
    },
    { totals: {}, rows: [] }
  );
}
