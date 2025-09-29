-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "title" VARCHAR(512),
ADD COLUMN     "title_color" TEXT NOT NULL DEFAULT '<1, 1, 1>',
ALTER COLUMN "role" SET DEFAULT 'Free';
