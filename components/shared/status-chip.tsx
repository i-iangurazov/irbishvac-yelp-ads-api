import { Badge } from "@/components/ui/badge";

const variantMap: Record<string, Parameters<typeof Badge>[0]["variant"]> = {
  QUEUED: "secondary",
  PROCESSING: "warning",
  COMPLETED: "success",
  ACTIVE: "success",
  READY: "success",
  SUCCESS: "success",
  SCHEDULED: "secondary",
  PARTIAL: "warning",
  FAILED: "destructive",
  ENDED: "outline",
  REQUESTED: "secondary",
  UNTESTED: "secondary"
};

export function StatusChip({ status }: { status: string }) {
  return <Badge variant={variantMap[status] ?? "outline"}>{status.toLowerCase().replaceAll("_", " ")}</Badge>;
}
