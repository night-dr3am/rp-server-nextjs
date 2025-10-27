-- AlterTable
ALTER TABLE "public"."npc_tasks" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';

-- CreateTable
CREATE TABLE "public"."gorean_stats" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "character_name" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "title" VARCHAR(512),
    "background" TEXT,
    "species" TEXT NOT NULL,
    "species_category" TEXT NOT NULL,
    "species_variant" TEXT,
    "culture" TEXT NOT NULL,
    "culture_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "status_subtype" TEXT,
    "caste_role" TEXT,
    "caste_role_type" TEXT,
    "region" TEXT,
    "home_stone_name" TEXT,
    "strength" INTEGER NOT NULL DEFAULT 1,
    "agility" INTEGER NOT NULL DEFAULT 1,
    "intellect" INTEGER NOT NULL DEFAULT 1,
    "perception" INTEGER NOT NULL DEFAULT 1,
    "charisma" INTEGER NOT NULL DEFAULT 1,
    "stat_points_pool" INTEGER NOT NULL DEFAULT 10,
    "stat_points_spent" INTEGER NOT NULL DEFAULT 0,
    "health_max" INTEGER NOT NULL DEFAULT 5,
    "hunger_max" INTEGER NOT NULL DEFAULT 100,
    "thirst_max" INTEGER NOT NULL DEFAULT 100,
    "health_current" INTEGER NOT NULL DEFAULT 5,
    "hunger_current" INTEGER NOT NULL DEFAULT 100,
    "thirst_current" INTEGER NOT NULL DEFAULT 100,
    "gold_coin" INTEGER NOT NULL DEFAULT 0,
    "silver_coin" INTEGER NOT NULL DEFAULT 0,
    "copper_coin" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "skills" JSONB DEFAULT '[]',
    "skills_allocated_points" INTEGER NOT NULL DEFAULT 5,
    "skills_spent_points" INTEGER NOT NULL DEFAULT 0,
    "active_effects" JSONB DEFAULT '[]',
    "live_stats" JSONB DEFAULT '{}',
    "registration_completed" BOOLEAN NOT NULL DEFAULT false,
    "gor_role" TEXT NOT NULL DEFAULT 'player',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gorean_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gorean_stats_user_id_key" ON "public"."gorean_stats"("user_id");

-- AddForeignKey
ALTER TABLE "public"."gorean_stats" ADD CONSTRAINT "gorean_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
