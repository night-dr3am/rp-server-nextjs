/*
  Warnings:

  - A unique constraint covering the columns `[sl_uuid,universe]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."users_sl_uuid_key";

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "universe" TEXT NOT NULL DEFAULT 'Gor',
ALTER COLUMN "role" SET DEFAULT 'Free';

-- CreateIndex
CREATE UNIQUE INDEX "users_sl_uuid_universe_key" ON "public"."users"("sl_uuid", "universe");
