CREATE TYPE "ReportScheduleDeliveryScope" AS ENUM ('ACCOUNT_ONLY', 'LOCATION_ONLY', 'ACCOUNT_AND_LOCATION');

ALTER TABLE "ReportSchedule"
ADD COLUMN "deliveryScope" "ReportScheduleDeliveryScope" NOT NULL DEFAULT 'ACCOUNT_ONLY',
ADD COLUMN "locationRecipientOverridesJson" JSONB NOT NULL DEFAULT '[]';

UPDATE "ReportSchedule"
SET "deliveryScope" = CASE
  WHEN "deliverPerLocation" = true THEN 'LOCATION_ONLY'::"ReportScheduleDeliveryScope"
  ELSE 'ACCOUNT_ONLY'::"ReportScheduleDeliveryScope"
END;

ALTER TABLE "ReportScheduleRun"
ADD COLUMN "recipientContextJson" JSONB NOT NULL DEFAULT '{}';
