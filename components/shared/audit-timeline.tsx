import { formatDateTime, titleCase } from "@/lib/utils/format";

import { StatusChip } from "@/components/shared/status-chip";

function formatAuditAction(actionType: string) {
  return titleCase(actionType.replaceAll(".", " ").replaceAll("/", " "));
}

export function AuditTimeline({
  events
}: {
  events: Array<{
    id: string;
    actionType: string;
    status: string;
    createdAt: Date;
    actor?: { name: string } | null;
  }>;
}) {
  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="rounded-xl border border-border/80 bg-muted/10 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium">{formatAuditAction(event.actionType)}</div>
              <div className="text-xs text-muted-foreground">
                {event.actor?.name ?? "System"} on {formatDateTime(event.createdAt)}
              </div>
            </div>
            <StatusChip status={event.status} />
          </div>
        </li>
      ))}
    </ol>
  );
}
