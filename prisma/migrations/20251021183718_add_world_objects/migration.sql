-- AlterTable
ALTER TABLE "public"."npc_tasks" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';

-- CreateTable
CREATE TABLE "public"."world_objects" (
    "id" SERIAL NOT NULL,
    "object_id" TEXT NOT NULL,
    "universe" TEXT NOT NULL DEFAULT 'arkana',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "owner" TEXT,
    "type" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'default',
    "stats" JSONB NOT NULL DEFAULT '{}',
    "groups" JSONB NOT NULL DEFAULT '[]',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "world_objects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "world_objects_object_id_universe_key" ON "public"."world_objects"("object_id", "universe");
