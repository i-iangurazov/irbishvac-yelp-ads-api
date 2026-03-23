import { formatDateTime } from "@/lib/utils/format";

import { StatusChip } from "@/components/shared/status-chip";

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
    <ol className="space-y-4">
      {events.map((event) => (
        <li key={event.id} className="rounded-lg border border-border/80 bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium">{event.actionType}</div>
              <div className="text-sm text-muted-foreground">
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
