import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LeadsFilterForm({
  businesses,
  values
}: {
  businesses: Array<{ id: string; name: string }>;
  values: {
    businessId?: string;
    status?: string;
    mappingState?: string;
    internalStatus?: string;
    from?: string;
    to?: string;
  };
}) {
  return (
    <form
      action="/leads"
      className="grid gap-4 rounded-[1.6rem] border border-border/80 bg-muted/10 p-5 md:grid-cols-2 2xl:grid-cols-[1.2fr_0.95fr_0.95fr_0.95fr_0.8fr_0.8fr_auto_auto]"
    >
      <div className="space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="businessId">
          Business
        </label>
        <select
          className="ui-native-select"
          defaultValue={values.businessId ?? ""}
          id="businessId"
          name="businessId"
        >
          <option value="">All businesses</option>
          {businesses.map((business) => (
            <option key={business.id} value={business.id}>
              {business.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="mappingState">
          Mapping
        </label>
        <select
          className="ui-native-select"
          defaultValue={values.mappingState ?? ""}
          id="mappingState"
          name="mappingState"
        >
          <option value="">All mappings</option>
          <option value="UNRESOLVED">Unresolved</option>
          <option value="MATCHED">Matched</option>
          <option value="MANUAL_OVERRIDE">Manual override</option>
          <option value="CONFLICT">Conflict</option>
          <option value="ERROR">Error</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="status">
          Ingestion
        </label>
        <select
          className="ui-native-select"
          defaultValue={values.status ?? ""}
          id="status"
          name="status"
        >
          <option value="">All statuses</option>
          <option value="COMPLETED">Completed</option>
          <option value="PROCESSING">In progress</option>
          <option value="FAILED">Failed</option>
          <option value="PARTIAL">Partial</option>
          <option value="QUEUED">Queued</option>
          <option value="SKIPPED">Skipped</option>
          <option value="NOT_RECEIVED">No delivery</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="internalStatus">
          Internal status
        </label>
        <select
          className="ui-native-select"
          defaultValue={values.internalStatus ?? ""}
          id="internalStatus"
          name="internalStatus"
        >
          <option value="">All internal statuses</option>
          <option value="UNMAPPED">Unmapped</option>
          <option value="NEW">New</option>
          <option value="CONTACTED">Contacted</option>
          <option value="BOOKED">Booked</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="JOB_IN_PROGRESS">Job in progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELED">Canceled</option>
          <option value="CLOSED_WON">Closed won</option>
          <option value="CLOSED_LOST">Closed lost</option>
          <option value="LOST">Lost</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="from">
          From
        </label>
        <Input defaultValue={values.from ?? ""} id="from" name="from" type="date" />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="to">
          To
        </label>
        <Input defaultValue={values.to ?? ""} id="to" name="to" type="date" />
      </div>

      <div className="flex items-end">
        <Button className="w-full" type="submit" variant="outline">
          Apply
        </Button>
      </div>

      <div className="flex items-end">
        <Button asChild className="w-full" type="button" variant="ghost">
          <Link href="/leads">Reset</Link>
        </Button>
      </div>
    </form>
  );
}
