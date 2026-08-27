import { NegativeKeywordManager } from "@/components/forms/negative-keyword-manager";
import { YelpSyncButton } from "@/components/forms/yelp-sync-button";
import { CapabilityState } from "@/components/shared/capability-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProgramFeatureOverview } from "@/features/program-features/service";
import { requirePermission } from "@/lib/auth/service";
import { hasPermission } from "@/lib/permissions";
import { titleCase } from "@/lib/utils/format";

export default async function ProgramFeaturesPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const user = await requirePermission("features:read");
  const { programId } = await params;
  const overview = await getProgramFeatureOverview(user.tenantId, programId);
  const canManageFeatures =
    hasPermission(user.role.code, "features:write") &&
    (overview.capabilityState.enabled || overview.capabilityState.demoMode);
  const writeMode = canManageFeatures
    ? overview.capabilityState.enabled
      ? ("LIVE" as const)
      : ("DEMO" as const)
    : ("READ_ONLY" as const);

  return (
    <div>
      <PageHeader
        title={`Program features · ${overview.program.business.name}`}
        description="Review Yelp's available program features and manage search-term exclusions with provider read-back verification."
        actions={<YelpSyncButton label="Refresh from Yelp" />}
      />

      <CapabilityState
        enabled={overview.capabilityState.enabled}
        message={overview.capabilityState.message}
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Available on Yelp</CardTitle>
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
              No available Yelp features were detected for this program.
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            {overview.liveFeatureState.loaded
              ? "These feature types come from the live Yelp Program Feature API. Availability does not necessarily mean a feature is currently active."
              : (overview.liveFeatureState.message ??
                "Live Yelp feature visibility is unavailable, so the console is falling back to saved local snapshots.")}
          </div>
        </CardContent>
      </Card>

      <NegativeKeywordManager
        programId={overview.program.id}
        supported={overview.negativeKeywords.supported}
        suggestedKeywords={overview.negativeKeywords.suggestedKeywords}
        blockedKeywords={overview.negativeKeywords.blockedKeywords}
        source={overview.negativeKeywords.source}
        syncedAt={overview.negativeKeywords.syncedAt}
        message={overview.negativeKeywords.message}
        writeMode={writeMode}
      />
    </div>
  );
}
