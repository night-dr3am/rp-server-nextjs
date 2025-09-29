-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';

-- CreateTable
CREATE TABLE "public"."profile_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profile_tokens_token_key" ON "public"."profile_tokens"("token");

-- CreateIndex
CREATE INDEX "profile_tokens_token_idx" ON "public"."profile_tokens"("token");

-- CreateIndex
CREATE INDEX "profile_tokens_expires_at_idx" ON "public"."profile_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "profile_tokens_user_id_idx" ON "public"."profile_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "public"."profile_tokens" ADD CONSTRAINT "profile_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
