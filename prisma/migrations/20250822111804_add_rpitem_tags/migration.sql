-- AlterTable
ALTER TABLE "public"."rp_items" ADD COLUMN     "tags" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';
