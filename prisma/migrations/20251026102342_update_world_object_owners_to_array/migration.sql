/*
  Warnings:

  - You are about to drop the column `owner` on the `world_objects` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."npc_tasks" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';

-- AlterTable
ALTER TABLE "public"."world_objects" DROP COLUMN "owner",
ADD COLUMN     "owners" TEXT[] DEFAULT ARRAY[]::TEXT[];
