import Link from "next/link";

import { ProgramForm } from "@/components/forms/program-form";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { getBusinessesIndex } from "@/features/businesses/service";
import { requireUser } from "@/lib/auth/service";

export default async function NewProgramPage() {
  const user = await requireUser();
  const businesses = await getBusinessesIndex(user.tenantId);

  return (
    <div>
      <PageHeader
        title="New program"
        description="Create a Yelp ad program with CPC-specific guardrails, previewed cents payloads, and async job tracking."
      />

      {businesses.length === 0 ? (
        <EmptyState
          title="No businesses available yet"
          description="Save a business first before creating an ad program. Use manual entry if Business Match is not enabled for this tenant."
          action={
            <Button asChild>
              <Link href="/businesses">Open businesses</Link>
            </Button>
          }
        />
      ) : (
        <ProgramForm
          mode="create"
          businesses={businesses.map((business) => ({
            id: business.id,
            name: business.name,
            categories: business.categories,
            readiness: business.readiness
          }))}
        />
      )}
    </div>
  );
}
