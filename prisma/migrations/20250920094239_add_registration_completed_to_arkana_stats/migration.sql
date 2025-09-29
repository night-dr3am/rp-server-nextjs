-- AlterTable
ALTER TABLE "public"."arkana_stats" ADD COLUMN     "registration_completed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';
