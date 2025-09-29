-- AlterTable
ALTER TABLE "public"."npc_tasks" ALTER COLUMN "status" SET DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "known_recipes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "role" SET DEFAULT 'Free';

-- CreateTable
CREATE TABLE "public"."recipes" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "short_name" VARCHAR(100) NOT NULL,
    "universe" TEXT NOT NULL DEFAULT 'Gor',
    "crafting_station_type" VARCHAR(100) NOT NULL,
    "ingredients" JSONB NOT NULL,
    "crafting_time" INTEGER NOT NULL,
    "output_item_short_name" VARCHAR(100) NOT NULL,
    "output_item_quantity" INTEGER NOT NULL DEFAULT 1,
    "knowledge" VARCHAR(255),
    "tool" VARCHAR(255),
    "license" VARCHAR(255),
    "category" VARCHAR(100) NOT NULL,
    "tags" VARCHAR(500) NOT NULL DEFAULT '',
    "exp" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."crafting_stations" (
    "id" SERIAL NOT NULL,
    "station_id" VARCHAR(100) NOT NULL,
    "universe" TEXT NOT NULL DEFAULT 'Gor',
    "name" VARCHAR(255) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "busy" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crafting_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."craftings" (
    "id" SERIAL NOT NULL,
    "universe" TEXT NOT NULL DEFAULT 'Gor',
    "user_id" TEXT NOT NULL,
    "crafting_station_id" INTEGER NOT NULL,
    "recipe_short_name" VARCHAR(100) NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "craftings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipes_crafting_station_type_category_idx" ON "public"."recipes"("crafting_station_type", "category");

-- CreateIndex
CREATE INDEX "recipes_universe_idx" ON "public"."recipes"("universe");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_short_name_universe_key" ON "public"."recipes"("short_name", "universe");

-- CreateIndex
CREATE INDEX "crafting_stations_universe_type_idx" ON "public"."crafting_stations"("universe", "type");

-- CreateIndex
CREATE UNIQUE INDEX "crafting_stations_station_id_universe_key" ON "public"."crafting_stations"("station_id", "universe");

-- CreateIndex
CREATE INDEX "craftings_user_id_collected_idx" ON "public"."craftings"("user_id", "collected");

-- CreateIndex
CREATE INDEX "craftings_crafting_station_id_collected_idx" ON "public"."craftings"("crafting_station_id", "collected");

-- CreateIndex
CREATE INDEX "craftings_universe_idx" ON "public"."craftings"("universe");

-- AddForeignKey
ALTER TABLE "public"."craftings" ADD CONSTRAINT "craftings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."craftings" ADD CONSTRAINT "craftings_crafting_station_id_fkey" FOREIGN KEY ("crafting_station_id") REFERENCES "public"."crafting_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."craftings" ADD CONSTRAINT "craftings_recipe_short_name_universe_fkey" FOREIGN KEY ("recipe_short_name", "universe") REFERENCES "public"."recipes"("short_name", "universe") ON DELETE CASCADE ON UPDATE CASCADE;
