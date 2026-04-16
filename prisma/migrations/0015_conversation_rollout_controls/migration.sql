-- AlterEnum
DO $$
BEGIN
  ALTER TYPE "LeadConversationStopReason" ADD VALUE IF NOT EXISTS 'ROLLOUT_PAUSED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
