import { PageHeader } from "@/components/shared/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAuditLog } from "@/features/audit/service";
import { getAuditSyncOverview } from "@/features/operations/service";
import { requireUser } from "@/lib/auth/service";
import { formatDateTime } from "@/lib/utils/format";

export default async function AuditPage() {
  const user = await requireUser();
  const [events, syncOverview] = await Promise.all([getAuditLog(user.tenantId), getAuditSyncOverview(user.tenantId)]);

  return (
    <div>
      <PageHeader
        title="Audit / Sync Logs"
        description="Searchable history of operator activity plus the sync-run log that will back webhook, reporting, and CRM diagnostics."
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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent sync runs</CardTitle>
          <CardDescription>Operational pipeline executions will surface here alongside user-facing audit activity.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issues</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {syncOverview.recentSyncRuns.map((syncRun) => (
                <TableRow key={syncRun.id}>
                  <TableCell>{formatDateTime(syncRun.startedAt)}</TableCell>
                  <TableCell>{syncRun.type}</TableCell>
                  <TableCell>
                    <StatusChip status={syncRun.status} />
                  </TableCell>
                  <TableCell>{syncRun._count.errors}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
