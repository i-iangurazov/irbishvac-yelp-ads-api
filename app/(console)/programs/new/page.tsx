import Link from "next/link";

import { ProgramForm } from "@/components/forms/program-form";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { getBusinessesIndex } from "@/features/businesses/service";
import { requireUser } from "@/lib/auth/service";

export default async function NewProgramPage({
  searchParams
}: {
  searchParams: Promise<{ businessId?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const businesses = await getBusinessesIndex(user.tenantId);
  const initialBusinessId = businesses.some((business) => business.id === query.businessId) ? query.businessId : undefined;

  return (
    <div>
      <PageHeader
        title="New program"
        description="Submit a new Yelp program request. The console stores the request immediately, then waits for Yelp to settle the final state."
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
          initialValues={{
            businessId: initialBusinessId
          }}
        />
      )}
    </div>
  );
}
