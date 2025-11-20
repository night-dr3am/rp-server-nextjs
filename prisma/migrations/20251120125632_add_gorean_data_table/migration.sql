-- AlterTable
ALTER TABLE "public"."npc_tasks" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';

-- CreateTable
CREATE TABLE "public"."gorean_data" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "json_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gorean_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gorean_data_type_idx" ON "public"."gorean_data"("type");
