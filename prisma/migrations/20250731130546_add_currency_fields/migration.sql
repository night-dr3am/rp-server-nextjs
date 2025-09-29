-- AlterTable
ALTER TABLE "public"."user_stats" ADD COLUMN     "copper_coin" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "gold_coin" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "silver_coin" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';
