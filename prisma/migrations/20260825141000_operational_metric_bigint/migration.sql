ALTER TABLE "OperationalMetricRollup"
ALTER COLUMN "totalValue" TYPE BIGINT USING "totalValue"::BIGINT,
ALTER COLUMN "lastValue" TYPE BIGINT USING "lastValue"::BIGINT;
