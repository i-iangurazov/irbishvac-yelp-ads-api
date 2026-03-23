import { FeatureFormCard } from "@/components/forms/feature-form-card";
import { CapabilityState } from "@/components/shared/capability-state";
import { PageHeader } from "@/components/shared/page-header";
import { featureCatalog } from "@/features/program-features/schemas";
import { getProgramFeatureOverview } from "@/features/program-features/service";
import { requireUser } from "@/lib/auth/service";

export default async function ProgramFeaturesPage({ params }: { params: Promise<{ programId: string }> }) {
  const user = await requireUser();
  const { programId } = await params;
  const overview = await getProgramFeatureOverview(user.tenantId, programId);

  const latestMap = new Map<string, (typeof overview.features)[number]>(overview.features.map((feature) => [feature.type, feature]));

  return (
    <div>
      <PageHeader
        title={`Program features · ${overview.program.business.name}`}
        description="Update individual feature settings with contextual descriptions, explicit save actions, and delete handling where Yelp expects DELETE semantics."
      />

      <CapabilityState enabled={overview.capabilityState.enabled} message={overview.capabilityState.message} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {Object.keys(featureCatalog).map((featureType) => (
          <FeatureFormCard
            key={featureType}
            programId={overview.program.id}
            featureType={featureType as keyof typeof featureCatalog}
            initialValue={(latestMap.get(featureType)?.valueJson as Record<string, unknown> | undefined) ?? { type: featureType }}
          />
        ))}
      </div>
    </div>
  );
}
