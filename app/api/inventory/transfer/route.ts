/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { inventoryTransferSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { error, value } = inventoryTransferSchema.validate(body);
    if (error) return NextResponse.json({ success: false, error: error.details[0].message }, { status: 400 });

    const { from_uuid, to_uuid, universe, shortName, quantity, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

  await prisma.$transaction(async (tx) => {
      const from = await tx.user.findFirst({
        where: {
          slUuid: from_uuid,
          universe: {
            equals: universe,
            mode: 'insensitive'
          }
        }
      });
      const to = await tx.user.findFirst({
        where: {
          slUuid: to_uuid,
          universe: {
            equals: universe,
            mode: 'insensitive'
          }
        }
      });
      if (!from || !to) throw new Error('User not found');

      const item = await (tx as any).rpItem.findUnique({
        where: {
          shortName_universe: {
            shortName,
            universe
          }
        }
      });
      if (!item) throw new Error('Item not found');

      const existingFrom = await (tx as any).userInventory.findUnique({ where: { userId_rpItemId: { userId: from.id, rpItemId: item.id } } });
      if (!existingFrom || existingFrom.quantity < quantity) throw new Error('Insufficient quantity');

      // decrement from
      await (tx as any).userInventory.update({ where: { id: existingFrom.id }, data: { quantity: existingFrom.quantity - quantity } });

      // increment to (create if needed)
      const existingTo = await (tx as any).userInventory.findUnique({ where: { userId_rpItemId: { userId: to.id, rpItemId: item.id } } });
      const updatedTo = existingTo
        ? await (tx as any).userInventory.update({ where: { id: existingTo.id }, data: { quantity: existingTo.quantity + quantity } })
        : await (tx as any).userInventory.create({ data: { userId: to.id, rpItemId: item.id, quantity } });

      await tx.event.createMany({
        data: [
          { type: 'INVENTORY_TRANSFER_OUT', userId: from.id, details: { to: to_uuid, shortName, quantity } },
          { type: 'INVENTORY_TRANSFER_IN', userId: to.id, details: { from: from_uuid, shortName, quantity } }
        ]
      });

  return { updatedTo };
    });

    return NextResponse.json({ success: true, data: { from_uuid, to_uuid, shortName, quantityTransferred: quantity } });
  } catch (err: unknown) {
    let message = 'Internal server error';
    let status = 500;
    if (err instanceof Error) {
      message = err.message;
      if (message.includes('not found')) status = 404;
      if (message.includes('Insufficient')) status = 400;
    }
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
