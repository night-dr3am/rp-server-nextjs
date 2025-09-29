-- CreateEnum
CREATE TYPE "public"."_task_status" AS ENUM ('ASSIGNED', 'COMPLETED', 'DECLINED', 'EXPIRED');

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';

-- CreateTable
CREATE TABLE "public"."npcs" (
    "id" SERIAL NOT NULL,
    "npc_id" TEXT NOT NULL,
    "universe" TEXT NOT NULL DEFAULT 'Gor',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "max_daily_tasks" INTEGER NOT NULL DEFAULT 3,
    "task_interval" INTEGER NOT NULL DEFAULT 300,
    "reset_hour" INTEGER NOT NULL DEFAULT 6,
    "min_reward_mult" INTEGER NOT NULL DEFAULT 3,
    "max_reward_mult" INTEGER NOT NULL DEFAULT 7,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "npcs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."npc_tasks" (
    "id" SERIAL NOT NULL,
    "npc_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "item_short_name" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "reward_copper" INTEGER NOT NULL,
    "status" "public"."_task_status" NOT NULL DEFAULT 'ASSIGNED',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "daily_count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "npc_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "npcs_npc_id_universe_key" ON "public"."npcs"("npc_id", "universe");

-- CreateIndex
CREATE INDEX "npc_tasks_user_id_status_idx" ON "public"."npc_tasks"("user_id", "status");

-- CreateIndex
CREATE INDEX "npc_tasks_npc_id_user_id_idx" ON "public"."npc_tasks"("npc_id", "user_id");

-- AddForeignKey
ALTER TABLE "public"."npc_tasks" ADD CONSTRAINT "npc_tasks_npc_id_fkey" FOREIGN KEY ("npc_id") REFERENCES "public"."npcs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."npc_tasks" ADD CONSTRAINT "npc_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
