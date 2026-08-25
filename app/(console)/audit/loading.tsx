import { Card, CardContent, CardHeader } from "@/components/ui/card";

function LoadingBlock({ className = "h-16" }: { className?: string }) {
  return <div className={`${className} animate-pulse rounded-md bg-muted`} />;
}

export default function AuditLoading() {
  return (
    <div
      className="min-w-0"
      aria-busy="true"
      aria-label="Loading audit operations"
    >
      <div className="mb-6 space-y-3">
        <LoadingBlock className="h-8 w-36" />
        <LoadingBlock className="h-4 w-full max-w-xl" />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index}>
            <CardContent className="space-y-3 p-5">
              <LoadingBlock className="h-3 w-24" />
              <LoadingBlock className="h-8 w-16" />
              <LoadingBlock className="h-3 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <LoadingBlock className="h-6 w-44" />
          <LoadingBlock className="h-4 w-full max-w-2xl" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <LoadingBlock key={index} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
