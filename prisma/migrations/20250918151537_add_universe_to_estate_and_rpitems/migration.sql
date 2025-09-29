/*
  Warnings:

  - A unique constraint covering the columns `[estate_id,universe]` on the table `estates` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[short_name,universe]` on the table `rp_items` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."estates_estate_id_key";

-- DropIndex
DROP INDEX "public"."rp_items_short_name_key";

-- AlterTable
ALTER TABLE "public"."estates" ADD COLUMN     "universe" TEXT NOT NULL DEFAULT 'Gor';

-- AlterTable
ALTER TABLE "public"."rp_items" ADD COLUMN     "universe" TEXT NOT NULL DEFAULT 'Gor';

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';

-- CreateIndex
CREATE UNIQUE INDEX "estates_estate_id_universe_key" ON "public"."estates"("estate_id", "universe");

-- CreateIndex
CREATE UNIQUE INDEX "rp_items_short_name_universe_key" ON "public"."rp_items"("short_name", "universe");
