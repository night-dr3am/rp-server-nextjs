-- AlterTable
ALTER TABLE "public"."arkana_stats" ADD COLUMN     "chips" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "credits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';
