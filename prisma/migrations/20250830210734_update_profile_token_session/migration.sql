/*
  Warnings:

  - You are about to drop the column `used` on the `profile_tokens` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."profile_tokens" DROP COLUMN "used",
ADD COLUMN     "session_id" TEXT;

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';
