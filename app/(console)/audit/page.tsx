import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAuditLog } from "@/features/audit/service";
import { requireUser } from "@/lib/auth/service";
import { formatDateTime } from "@/lib/utils/format";

export default async function AuditPage() {
  const user = await requireUser();
  const events = await getAuditLog(user.tenantId);

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Searchable history of operational requests, actor attribution, request/response summaries, and before/after diffs."
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
          <CardDescription>Use this as the first stop when reviewing who changed what and when.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{formatDateTime(event.createdAt)}</TableCell>
                  <TableCell>{event.actor?.name ?? "System"}</TableCell>
                  <TableCell>{event.actionType}</TableCell>
                  <TableCell><StatusChip status={event.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
