WITH ranked_programs AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId", "upstreamProgramId"
      ORDER BY "updatedAt" DESC, "id" DESC
    ) AS duplicate_rank
  FROM "Program"
  WHERE "upstreamProgramId" IS NOT NULL
)
UPDATE "Program" AS program
SET
  "upstreamProgramId" = NULL,
  "status" = 'ENDED',
  "configurationJson" = COALESCE(program."configurationJson", '{}'::jsonb) ||
    jsonb_build_object(
      'deduplicatedUpstreamProgramAt', CURRENT_TIMESTAMP,
      'deduplicatedReason', 'DUPLICATE_UPSTREAM_PROGRAM_ID'
    )
FROM ranked_programs
WHERE program."id" = ranked_programs."id"
  AND ranked_programs.duplicate_rank > 1;

CREATE UNIQUE INDEX "Program_tenantId_upstreamProgramId_key"
ON "Program"("tenantId", "upstreamProgramId");
