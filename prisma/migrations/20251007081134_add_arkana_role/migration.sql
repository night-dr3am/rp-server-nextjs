-- AlterTable
ALTER TABLE "public"."arkana_stats" ADD COLUMN     "arkana_role" TEXT NOT NULL DEFAULT 'player';

-- AlterTable
ALTER TABLE "public"."npc_tasks" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';
