/*
  Warnings:

  - You are about to drop the column `copper_coin` on the `gorean_stats` table. All the data in the column will be lost.
  - You are about to drop the column `gold_coin` on the `gorean_stats` table. All the data in the column will be lost.
  - You are about to drop the column `silver_coin` on the `gorean_stats` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."crafting_stations" ALTER COLUMN "universe" SET DEFAULT 'gor';

-- AlterTable
ALTER TABLE "public"."craftings" ALTER COLUMN "universe" SET DEFAULT 'gor';

-- AlterTable
ALTER TABLE "public"."estates" ALTER COLUMN "universe" SET DEFAULT 'gor';

-- AlterTable
ALTER TABLE "public"."gorean_stats" DROP COLUMN "copper_coin",
DROP COLUMN "gold_coin",
DROP COLUMN "silver_coin";

-- AlterTable
ALTER TABLE "public"."npc_tasks" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE "public"."npcs" ALTER COLUMN "universe" SET DEFAULT 'gor';

-- AlterTable
ALTER TABLE "public"."recipes" ALTER COLUMN "universe" SET DEFAULT 'gor';

-- AlterTable
ALTER TABLE "public"."rp_items" ALTER COLUMN "universe" SET DEFAULT 'gor';

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free',
ALTER COLUMN "universe" SET DEFAULT 'gor';
