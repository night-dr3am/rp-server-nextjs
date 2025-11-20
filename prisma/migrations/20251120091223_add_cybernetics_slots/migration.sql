-- AlterTable
ALTER TABLE "public"."arkana_stats" ADD COLUMN     "cybernetics_slots" INTEGER NOT NULL DEFAULT 0;

-- Update existing records to set cybernetics_slots based on array length
-- This ensures backward compatibility for existing characters
UPDATE "public"."arkana_stats"
SET "cybernetics_slots" = COALESCE(array_length("cybernetic_augments", 1), 0);

-- AlterTable
ALTER TABLE "public"."npc_tasks" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';
