import Link from "next/link";

import { ReportStatusPoller } from "@/components/forms/report-status-poller";
import { JsonViewer } from "@/components/shared/json-viewer";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { ReportChart } from "@/components/shared/report-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildCombinedReportPayload } from "@/features/reporting/payloads";
import { getReportDetail } from "@/features/reporting/service";
import { requireUser } from "@/lib/auth/service";
import { formatCurrency } from "@/lib/utils/format";

export default async function ReportDetailPage({ params }: { params: Promise<{ reportId: string }> }) {
  const user = await requireUser();
  const { reportId } = await params;
  const report = await getReportDetail(user.tenantId, reportId);
  const payload = buildCombinedReportPayload(report);
  const totals = payload.totals ?? {};
  const rows = payload.rows ?? [];

  return (
    <div>
      <PageHeader
        title={`${report.granularity} report`}
        description="Review the latest fetched Yelp reporting snapshot, chart trends, exports, and raw payload details without treating the batch result as real-time."
        actions={
          <Button asChild variant="outline">
            <Link href={`/api/reports/${report.id}/export`}>Export CSV</Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Impressions" value={totals.impressions ?? 0} />
        <MetricCard title="Clicks" value={totals.clicks ?? 0} />
        <MetricCard title="Ad spend" value={formatCurrency(totals.adSpendCents ?? 0)} />
        <MetricCard title="Calls" value={totals.calls ?? 0} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <ReportChart rows={rows} />

          <Card>
            <CardHeader>
              <CardTitle>Table view</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {rows[0] ? Object.keys(rows[0]).map((key) => <TableHead key={key}>{key}</TableHead>) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={index}>
                      {Object.entries(row).map(([key, value]) => (
                        <TableCell key={key}>{String(value ?? "")}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <ReportStatusPoller reportId={report.id} />

          {user.role.code === "ADMIN" ? (
            <Card>
              <CardHeader>
                <CardTitle>Raw JSON payload</CardTitle>
              </CardHeader>
              <CardContent>
                <JsonViewer value={payload} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
