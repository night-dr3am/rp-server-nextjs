/*
  Warnings:

  - You are about to drop the column `type` on the `arkana_data` table. All the data in the column will be lost.
  - Added the required column `arkana_data_type` to the `arkana_data` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."arkana_data_type_idx";

-- AlterTable
ALTER TABLE "public"."arkana_data" DROP COLUMN "type",
ADD COLUMN     "arkana_data_type" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."npc_tasks" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';

-- CreateIndex
CREATE INDEX "arkana_data_arkana_data_type_idx" ON "public"."arkana_data"("arkana_data_type");
