import Link from "next/link";

import { ReportRequestForm } from "@/components/forms/report-request-form";
import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBusinessesIndex } from "@/features/businesses/service";
import { getReportingIndex } from "@/features/reporting/service";
import { requireUser } from "@/lib/auth/service";
import { formatDateTime } from "@/lib/utils/format";

export default async function ReportingPage() {
  const user = await requireUser();
  const [reports, businesses] = await Promise.all([getReportingIndex(user.tenantId), getBusinessesIndex(user.tenantId)]);

  return (
    <div>
      <PageHeader
        title="Reporting"
        description="Request daily or monthly Yelp reports, monitor batch generation status, and review delayed cached payloads without implying real-time finality."
      />

      <ReportRequestForm businesses={businesses.map((business) => ({ id: business.id, name: business.name }))} />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Saved report runs</CardTitle>
          <CardDescription>Cached report requests and their latest results.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requested</TableHead>
                <TableHead>Business scope</TableHead>
                <TableHead>Granularity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>{formatDateTime(report.createdAt)}</TableCell>
                  <TableCell>{report.business?.name ?? "Multiple businesses"}</TableCell>
                  <TableCell>{report.granularity}</TableCell>
                  <TableCell><StatusChip status={report.status} /></TableCell>
                  <TableCell>
                    <Link className="font-medium hover:underline" href={`/reporting/${report.id}`}>
                      Open report
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
