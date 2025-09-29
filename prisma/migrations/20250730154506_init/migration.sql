-- CreateEnum
CREATE TYPE "public"."_role" AS ENUM ('Free', 'Slave', 'Jarl', 'Bondmaid', 'Panther', 'Outlaw');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "sl_uuid" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "role" "public"."_role" NOT NULL DEFAULT 'Free',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_stats" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "health" INTEGER NOT NULL DEFAULT 100,
    "hunger" INTEGER NOT NULL DEFAULT 100,
    "thirst" INTEGER NOT NULL DEFAULT 100,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_sl_uuid_key" ON "public"."users"("sl_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "user_stats_user_id_key" ON "public"."user_stats"("user_id");

-- AddForeignKey
ALTER TABLE "public"."user_stats" ADD CONSTRAINT "user_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."events" ADD CONSTRAINT "events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
