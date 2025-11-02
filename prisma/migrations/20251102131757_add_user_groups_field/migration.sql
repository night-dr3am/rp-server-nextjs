-- AlterTable
ALTER TABLE "public"."npc_tasks" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "groups" JSONB DEFAULT '{}',
ALTER COLUMN "role" SET DEFAULT 'Free';
