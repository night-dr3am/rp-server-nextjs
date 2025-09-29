-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';

-- CreateTable
CREATE TABLE "public"."arkana_stats" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "character_name" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "alias_callsign" TEXT,
    "faction" TEXT,
    "concept_role" VARCHAR(512),
    "job" VARCHAR(256),
    "background" TEXT,
    "race" TEXT NOT NULL,
    "subrace" TEXT,
    "archetype" TEXT,
    "physical" INTEGER NOT NULL DEFAULT 1,
    "dexterity" INTEGER NOT NULL DEFAULT 1,
    "mental" INTEGER NOT NULL DEFAULT 1,
    "perception" INTEGER NOT NULL DEFAULT 1,
    "hit_points" INTEGER NOT NULL DEFAULT 5,
    "stat_points_pool" INTEGER NOT NULL DEFAULT 10,
    "stat_points_spent" INTEGER NOT NULL DEFAULT 0,
    "inherent_powers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "weaknesses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "flaws" JSONB,
    "flaw_points_granted" INTEGER NOT NULL DEFAULT 0,
    "power_points_budget" INTEGER NOT NULL DEFAULT 15,
    "power_points_bonus" INTEGER NOT NULL DEFAULT 0,
    "power_points_spent" INTEGER NOT NULL DEFAULT 0,
    "common_powers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archetype_powers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "perks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "magic_schools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "magic_weaves" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cybernetics" JSONB,
    "cybernetic_augments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arkana_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "arkana_stats_user_id_key" ON "public"."arkana_stats"("user_id");

-- AddForeignKey
ALTER TABLE "public"."arkana_stats" ADD CONSTRAINT "arkana_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
