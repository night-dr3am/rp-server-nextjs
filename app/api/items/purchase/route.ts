import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { itemPurchaseSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

// POST /api/items/purchase - Process an item purchase between two users
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { error, value } = itemPurchaseSchema.validate(body);
    if (error) {
      return NextResponse.json({ success: false, error: error.details[0].message }, { status: 400 });
    }

    const { buyer_uuid, seller_uuid, universe, goldCoin, silverCoin, copperCoin, itemName, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch buyer & seller with stats
    const [buyer, seller] = await Promise.all([
      prisma.user.findFirst({ where: { slUuid: buyer_uuid, universe }, include: { stats: true } }),
      prisma.user.findFirst({ where: { slUuid: seller_uuid, universe }, include: { stats: true } })
    ]);

    if (!buyer || !buyer.stats || !seller || !seller.stats) {
      return NextResponse.json({ success: false, error: 'Buyer or seller not found' }, { status: 404 });
    }

    // Validate funds
    if (buyer.stats.goldCoin < goldCoin || buyer.stats.silverCoin < silverCoin || buyer.stats.copperCoin < copperCoin) {
      return NextResponse.json({ success: false, error: 'Insufficient funds' }, { status: 400 });
    }

    // Execute atomic purchase
    const result = await prisma.$transaction(async (tx) => {
      // Update buyer stats
      await tx.userStats.update({
        where: { userId: buyer.id },
        data: {
          goldCoin: buyer.stats!.goldCoin - goldCoin,
          silverCoin: buyer.stats!.silverCoin - silverCoin,
          copperCoin: buyer.stats!.copperCoin - copperCoin,
          lastUpdated: new Date()
        }
      });

      // Update seller stats
      await tx.userStats.update({
        where: { userId: seller.id },
        data: {
          goldCoin: seller.stats!.goldCoin + goldCoin,
          silverCoin: seller.stats!.silverCoin + silverCoin,
          copperCoin: seller.stats!.copperCoin + copperCoin,
          lastUpdated: new Date()
        }
      });

      // Record event
      const event = await tx.event.create({
        data: {
          type: 'item_purchase',
          userId: buyer.id,
          details: {
            item: itemName,
            buyer: buyer.username,
            seller: seller.username,
            amount: `${goldCoin}g ${silverCoin}s ${copperCoin}c`
          },
          timestamp: new Date()
        }
      });

      return { eventId: event.id };
    });

    return NextResponse.json({
      success: true,
      buyerName: buyer.username,
      sellerName: seller.username,
      itemName,
      amount: `${goldCoin}g ${silverCoin}s ${copperCoin}c`,
      eventId: result.eventId,
      timestamp: new Date().toISOString()
    });
  } catch (err: unknown) {
    console.error('Item purchase error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
