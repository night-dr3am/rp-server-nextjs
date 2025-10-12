-- AlterTable
ALTER TABLE "public"."arkana_stats" ADD COLUMN     "active_effects" JSONB DEFAULT '[]',
ADD COLUMN     "live_stats" JSONB DEFAULT '{}';

-- AlterTable
ALTER TABLE "public"."npc_tasks" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';
