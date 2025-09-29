-- AlterTable
ALTER TABLE "public"."rp_items" ADD COLUMN     "use_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."user_inventory" ADD COLUMN     "use_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';
