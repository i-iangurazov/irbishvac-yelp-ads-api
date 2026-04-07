import type {
  ReportScheduleDeliveryStatus,
  ReportScheduleGenerationStatus,
  ReportScheduleRunScope
} from "@prisma/client";

export function mapReportStatusToGenerationStatus(status: string | null | undefined): ReportScheduleGenerationStatus {
  switch (status) {
    case "READY":
      return "READY";
    case "FAILED":
      return "FAILED";
    case "PROCESSING":
      return "PROCESSING";
    case "REQUESTED":
    default:
      return "REQUESTED";
  }
}

export function shouldFanOutLocationDelivery(
  scope: ReportScheduleRunScope,
  deliverPerLocation: boolean,
  locationRowCount: number
) {
  return scope === "ACCOUNT" && deliverPerLocation && locationRowCount > 0;
}

export function isReadyForDelivery(
  generationStatus: ReportScheduleGenerationStatus,
  deliveryStatus: ReportScheduleDeliveryStatus
) {
  return generationStatus === "READY" && deliveryStatus === "PENDING";
}
