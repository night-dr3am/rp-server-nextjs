-- AlterTable
ALTER TABLE "public"."gorean_stats" ADD COLUMN     "gor_administrative_role" TEXT NOT NULL DEFAULT 'player';

-- AlterTable
ALTER TABLE "public"."npc_tasks" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';
