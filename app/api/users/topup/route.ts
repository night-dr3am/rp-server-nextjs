import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateSignature } from '@/lib/signature';
import Joi from 'joi';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Basic validation schema
    const schema = Joi.object({
      sl_uuid: Joi.string().uuid().required(),
      universe: Joi.string().min(1).max(50).required(),
      goldCoin: Joi.number().integer().min(0).optional().default(0),
      silverCoin: Joi.number().integer().min(0).optional().default(0),
      copperCoin: Joi.number().integer().min(0).optional().default(0),
      details: Joi.string().optional(),
      timestamp: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/).required(),
      signature: Joi.string().pattern(/^[a-f0-9]{64}$/).required()
    });

    const { error, value } = schema.validate(body);
    if (error) {
      return NextResponse.json({ error: error.details[0].message }, { status: 400 });
    }

    const { sl_uuid, universe, goldCoin, silverCoin, copperCoin, details, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if at least one coin amount is provided
    if (goldCoin === 0 && silverCoin === 0 && copperCoin === 0) {
      return NextResponse.json({ error: 'At least one coin amount must be greater than 0' }, { status: 400 });
    }

    // Find the user with their stats
    const user = await prisma.user.findFirst({
      where: { slUuid: sl_uuid, universe },
      include: { stats: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Ensure user has stats record
    if (!user.stats) {
      return NextResponse.json({ error: 'User stats not found' }, { status: 404 });
    }

    // Update user's coin balance in stats
    const updatedStats = await prisma.userStats.update({
      where: { userId: user.id },
      data: {
        goldCoin: { increment: goldCoin },
        silverCoin: { increment: silverCoin },
        copperCoin: { increment: copperCoin }
      }
    });

    // Create event record for tracking
    const event = await prisma.event.create({
      data: {
        type: 'TOPUP',
        details: {
          goldCoin: goldCoin,
          silverCoin: silverCoin,
          copperCoin: copperCoin,
          description: details || `System topup: ${goldCoin}g ${silverCoin}s ${copperCoin}c`
        },
        userId: user.id
      }
    });

    const totalAmount = `${goldCoin}g ${silverCoin}s ${copperCoin}c`;

    return NextResponse.json({
      success: true,
      message: 'Topup successful',
      username: user.username,
      amount: totalAmount,
      goldCoin: goldCoin,
      silverCoin: silverCoin,
      copperCoin: copperCoin,
      newBalance: {
        goldCoin: updatedStats.goldCoin,
        silverCoin: updatedStats.silverCoin,
        copperCoin: updatedStats.copperCoin
      },
      eventId: event.id
    });

  } catch (error) {
    console.error('Topup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
