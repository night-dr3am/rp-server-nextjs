import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { goreanUpdateStatsSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

// POST /api/gor/stats/update - Update Gorean character statistics
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input using our validation schema
    const { error, value } = goreanUpdateStatsSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { sl_uuid, universe, health, hunger, thirst, goldCoin, silverCoin, copperCoin, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find user and their Gorean stats
    const user = await prisma.user.findFirst({
      where: {
        slUuid: sl_uuid,
        universe: universe
      },
      include: { goreanStats: true }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    if (!user.goreanStats) {
      return NextResponse.json(
        { success: false, error: 'Gorean character not created' },
        { status: 404 }
      );
    }

    // Prepare update data, only including fields if they're provided
    const updateData: {
      healthCurrent?: number;
      hungerCurrent?: number;
      thirstCurrent?: number;
      goldCoin?: number;
      silverCoin?: number;
      copperCoin?: number;
      updatedAt: Date;
    } = {
      updatedAt: new Date()
    };

    // Clamp health to valid range (0 to healthMax)
    if (health !== undefined) {
      updateData.healthCurrent = Math.max(0, Math.min(user.goreanStats.healthMax, health));
    }

    // Clamp hunger and thirst to valid ranges (0-100)
    if (hunger !== undefined) {
      updateData.hungerCurrent = Math.max(0, Math.min(100, hunger));
    }

    if (thirst !== undefined) {
      updateData.thirstCurrent = Math.max(0, Math.min(100, thirst));
    }

    // Update currency fields (no clamping, can be negative for debts)
    if (goldCoin !== undefined) updateData.goldCoin = goldCoin;
    if (silverCoin !== undefined) updateData.silverCoin = silverCoin;
    if (copperCoin !== undefined) updateData.copperCoin = copperCoin;

    // Update Gorean stats
    const updatedStats = await prisma.goreanStats.update({
      where: {
        userId: user.id
      },
      data: updateData
    });

    // Update user's last active timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() }
    });

    // Return success response
    return NextResponse.json({
      success: true,
      data: {
        message: 'Gorean stats updated successfully',
        healthCurrent: updatedStats.healthCurrent,
        healthMax: updatedStats.healthMax,
        hungerCurrent: updatedStats.hungerCurrent,
        thirstCurrent: updatedStats.thirstCurrent,
        goldCoin: updatedStats.goldCoin,
        silverCoin: updatedStats.silverCoin,
        copperCoin: updatedStats.copperCoin,
        updatedAt: updatedStats.updatedAt
      }
    });

  } catch (error: unknown) {
    console.error('Error updating Gorean stats:', error);

    // Handle case where Gorean stats don't exist
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Gorean character not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
