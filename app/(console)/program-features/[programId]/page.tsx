import { FeatureFormCard } from "@/components/forms/feature-form-card";
import { CapabilityState } from "@/components/shared/capability-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { featureCatalog } from "@/features/program-features/schemas";
import { getProgramFeatureOverview } from "@/features/program-features/service";
import { requireUser } from "@/lib/auth/service";
import { titleCase } from "@/lib/utils/format";

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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Enabled on Yelp</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {overview.enabledFeatureTypes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {overview.enabledFeatureTypes.map((featureType) => (
                <Badge key={featureType} variant="success">
                  {titleCase(featureType)}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No enabled Yelp features were detected for this program.
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            {overview.liveFeatureState.loaded
              ? "These feature types come from live Yelp program info. Only enabled features are shown below."
              : overview.liveFeatureState.message ?? "Live Yelp feature visibility is unavailable, so the console is falling back to saved local snapshots."}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {overview.enabledFeatureTypes.map((featureType) => (
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
