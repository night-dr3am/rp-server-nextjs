-- DropIndex
DROP INDEX "public"."arkana_data_arkana_data_type_idx";

-- AlterTable
ALTER TABLE "public"."arkana_data" ADD COLUMN     "order_number" INTEGER;

-- AlterTable
ALTER TABLE "public"."npc_tasks" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';

-- CreateIndex
CREATE INDEX "arkana_data_arkana_data_type_order_number_idx" ON "public"."arkana_data"("arkana_data_type", "order_number");
