-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'Free';

-- CreateTable
CREATE TABLE "public"."rp_items" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "is_short_name_different" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL,
    "hunger_value" INTEGER NOT NULL DEFAULT 0,
    "thirst_value" INTEGER NOT NULL DEFAULT 0,
    "health_value" INTEGER NOT NULL DEFAULT 0,
    "edible" BOOLEAN NOT NULL DEFAULT false,
    "drinkable" BOOLEAN NOT NULL DEFAULT false,
    "price_gold" INTEGER NOT NULL DEFAULT 0,
    "price_silver" INTEGER NOT NULL DEFAULT 0,
    "price_copper" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rp_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_inventory" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "rpitem_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "price_gold" INTEGER NOT NULL DEFAULT 0,
    "price_silver" INTEGER NOT NULL DEFAULT 0,
    "price_copper" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rp_items_short_name_key" ON "public"."rp_items"("short_name");

-- CreateIndex
CREATE UNIQUE INDEX "user_inventory_user_id_rpitem_id_key" ON "public"."user_inventory"("user_id", "rpitem_id");

-- AddForeignKey
ALTER TABLE "public"."user_inventory" ADD CONSTRAINT "user_inventory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_inventory" ADD CONSTRAINT "user_inventory_rpitem_id_fkey" FOREIGN KEY ("rpitem_id") REFERENCES "public"."rp_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
