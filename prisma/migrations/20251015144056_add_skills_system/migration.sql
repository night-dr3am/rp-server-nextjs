-- AlterTable
ALTER TABLE "public"."arkana_stats" ADD COLUMN     "skills" JSONB DEFAULT '[]',
ADD COLUMN     "skills_allocated_points" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "skills_spent_points" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."npc_tasks" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';
