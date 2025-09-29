/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { inventoryAdjustSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { error, value } = inventoryAdjustSchema.validate(body);
    if (error) return NextResponse.json({ success: false, error: error.details[0].message }, { status: 400 });

    const { sl_uuid, universe, shortName, quantity, useCount = 0, priceGold = 0, priceSilver = 0, priceCopper = 0, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: {
          slUuid: sl_uuid,
          universe: universe
        }
      });
      if (!user) throw new Error('User not found');

      const item = await (tx as any).rpItem.findFirst({
        where: {
          OR: [
            { shortName },
            { name: shortName }
          ]
        }
      });
      if (!item) throw new Error('Item not found');

      const existing = await (tx as any).userInventory.findUnique({ where: { userId_rpItemId: { userId: user.id, rpItemId: item.id } } });

      const updated = existing
  ? await (tx as any).userInventory.update({
            where: { id: existing.id },
            data: {
              quantity: existing.quantity + quantity,
              useCount: useCount || existing.useCount || 0,
              priceGold,
              priceSilver,
              priceCopper
            }
          })
  : await (tx as any).userInventory.create({
            data: {
              userId: user.id,
              rpItemId: item.id,
              quantity,
              useCount,
              priceGold,
              priceSilver,
              priceCopper
            }
          });

      await tx.event.create({
        data: {
          type: 'INVENTORY_ADD',
          userId: user.id,
          details: { shortName, quantity, price: { gold: priceGold, silver: priceSilver, copper: priceCopper } }
        }
      });

      return { updated, user, item };
    });

    return NextResponse.json({ success: true, data: { sl_uuid, shortName, quantityAdded: quantity, newQuantity: result.updated.quantity } });
  } catch (err: unknown) {
    let message = 'Internal server error';
    let status = 500;
    if (err instanceof Error) {
      message = err.message;
      if (message.includes('not found')) status = 404;
    }
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
