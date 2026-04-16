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
    attention?: string;
    mappingState?: string;
    internalStatus?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  };
}) {
  return (
    <form
      action="/leads"
      className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.05fr_0.85fr_0.85fr_0.85fr_1fr_0.78fr_0.78fr_0.68fr_auto_auto]"
    >
      <input name="page" type="hidden" value="1" />

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
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="attention">
          Attention
        </label>
        <select
          className="ui-native-select"
          defaultValue={values.attention ?? ""}
          id="attention"
          name="attention"
        >
          <option value="">All leads</option>
          <option value="NEEDS_ATTENTION">Needs attention</option>
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
          Partner lifecycle
        </label>
        <select
          className="ui-native-select"
          defaultValue={values.internalStatus ?? ""}
          id="internalStatus"
          name="internalStatus"
        >
          <option value="">All partner lifecycle statuses</option>
          <option value="UNMAPPED">Unmapped</option>
          <option value="ACTIVE">Active</option>
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

      <div className="space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="pageSize">
          Page size
        </label>
        <select
          className="ui-native-select"
          defaultValue={String(values.pageSize ?? 25)}
          id="pageSize"
          name="pageSize"
        >
          <option value="25">25 rows</option>
          <option value="50">50 rows</option>
          <option value="100">100 rows</option>
        </select>
      </div>

      <div className="flex items-end">
        <Button className="w-full" type="submit">
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
