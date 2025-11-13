-- AlterTable
ALTER TABLE "public"."gorean_stats" ADD COLUMN     "abilities" JSONB DEFAULT '[]',
ADD COLUMN     "abilities_allocated_points" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "abilities_spent_points" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."npc_tasks" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';
