import type {
  ReportScheduleDeliveryStatus,
  ReportScheduleDeliveryScope,
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
  deliveryScope: ReportScheduleDeliveryScope,
  locationRowCount: number
) {
  return scope === "ACCOUNT" && deliveryScope !== "ACCOUNT_ONLY" && locationRowCount > 0;
}

export function shouldSendAccountDelivery(deliveryScope: ReportScheduleDeliveryScope) {
  return deliveryScope !== "LOCATION_ONLY";
}

export function isReadyForDelivery(
  generationStatus: ReportScheduleGenerationStatus,
  deliveryStatus: ReportScheduleDeliveryStatus
) {
  return generationStatus === "READY" && deliveryStatus === "PENDING";
}
