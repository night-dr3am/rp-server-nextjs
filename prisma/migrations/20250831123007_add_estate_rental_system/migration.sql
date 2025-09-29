-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';

-- CreateTable
CREATE TABLE "public"."estates" (
    "id" SERIAL NOT NULL,
    "estate_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rent_price_per_day" INTEGER NOT NULL,
    "renting_user_id" TEXT,
    "location" TEXT,
    "rent_start_date" TIMESTAMP(3),
    "rent_end_date" TIMESTAMP(3),
    "total_paid_amount" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_EstateTenants" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EstateTenants_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "estates_estate_id_key" ON "public"."estates"("estate_id");

-- CreateIndex
CREATE INDEX "_EstateTenants_B_index" ON "public"."_EstateTenants"("B");

-- AddForeignKey
ALTER TABLE "public"."estates" ADD CONSTRAINT "estates_renting_user_id_fkey" FOREIGN KEY ("renting_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_EstateTenants" ADD CONSTRAINT "_EstateTenants_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."estates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_EstateTenants" ADD CONSTRAINT "_EstateTenants_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
