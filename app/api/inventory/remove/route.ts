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

    const { sl_uuid, universe, shortName, quantity, timestamp, signature } = value;

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

      const item = await (tx as any).rpItem.findUnique({
        where: {
          shortName_universe: {
            shortName,
            universe
          }
        }
      });
      if (!item) throw new Error('Item not found');

      const existing = await (tx as any).userInventory.findUnique({ where: { userId_rpItemId: { userId: user.id, rpItemId: item.id } } });
      if (!existing || existing.quantity < quantity) throw new Error('Insufficient quantity');

      const newQuantity = existing.quantity - quantity;
      if (newQuantity === 0) {
        await (tx as any).userInventory.delete({ where: { id: existing.id } });
      } else {
        await (tx as any).userInventory.update({
          where: { id: existing.id },
          data: { quantity: newQuantity }
        });
      }

      await tx.event.create({
        data: {
          type: 'INVENTORY_REMOVE',
          userId: user.id,
          details: { shortName, quantity }
        }
      });

      return { newQuantity };
    });

    return NextResponse.json({ success: true, data: { sl_uuid, shortName, quantityRemoved: quantity, newQuantity: result.newQuantity } });
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
