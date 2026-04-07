import Link from "next/link";

import { Button } from "@/components/ui/button";

export function OperatorIssuesFilterForm({
  businesses,
  locations,
  values
}: {
  businesses: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  values: {
    issueType?: string;
    businessId?: string;
    locationId?: string;
    severity?: string;
    status?: string;
    age?: string;
  };
}) {
  return (
    <form
      action="/audit"
      className="grid gap-4 rounded-[1.6rem] border border-border/80 bg-muted/10 p-5 md:grid-cols-2 2xl:grid-cols-[1fr_1fr_1fr_0.8fr_0.8fr_0.8fr_auto_auto]"
    >
      <div className="space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="issueType">
          Type
        </label>
        <select
          className="ui-native-select"
          defaultValue={values.issueType ?? ""}
          id="issueType"
          name="issueType"
        >
          <option value="">All issue types</option>
          <option value="LEAD_SYNC_FAILURE">Lead sync failure</option>
          <option value="UNMAPPED_LEAD">Unmapped lead</option>
          <option value="CRM_SYNC_FAILURE">CRM sync failure</option>
          <option value="AUTORESPONDER_FAILURE">Autoresponder failure</option>
          <option value="REPORT_DELIVERY_FAILURE">Report delivery failure</option>
          <option value="MAPPING_CONFLICT">Mapping conflict</option>
          <option value="STALE_LEAD">Stale lead</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="businessId">
          Client
        </label>
        <select
          className="ui-native-select"
          defaultValue={values.businessId ?? ""}
          id="businessId"
          name="businessId"
        >
          <option value="">All clients</option>
          {businesses.map((business) => (
            <option key={business.id} value={business.id}>
              {business.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="locationId">
          Location
        </label>
        <select
          className="ui-native-select"
          defaultValue={values.locationId ?? ""}
          id="locationId"
          name="locationId"
        >
          <option value="">All locations</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="severity">
          Severity
        </label>
        <select
          className="ui-native-select"
          defaultValue={values.severity ?? ""}
          id="severity"
          name="severity"
        >
          <option value="">All severities</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="status">
          Status
        </label>
        <select
          className="ui-native-select"
          defaultValue={values.status ?? "OPEN"}
          id="status"
          name="status"
        >
          <option value="OPEN">Open</option>
          <option value="RESOLVED">Resolved</option>
          <option value="IGNORED">Ignored</option>
          <option value="">All statuses</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="age">
          Age
        </label>
        <select
          className="ui-native-select"
          defaultValue={values.age ?? ""}
          id="age"
          name="age"
        >
          <option value="">Any age</option>
          <option value="1">1+ day</option>
          <option value="3">3+ days</option>
          <option value="7">7+ days</option>
          <option value="14">14+ days</option>
        </select>
      </div>

      <div className="flex items-end">
        <Button className="w-full" type="submit" variant="outline">
          Apply
        </Button>
      </div>

      <div className="flex items-end">
        <Button asChild className="w-full" type="button" variant="ghost">
          <Link href="/audit">Reset</Link>
        </Button>
      </div>
    </form>
  );
}
