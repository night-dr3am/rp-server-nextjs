import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaFirstAidSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input using our validation schema
    const { error, value } = arkanaFirstAidSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { healer_uuid, target_uuid, universe, timestamp, signature } = value;

    // Validate signature for Arkana universe
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get healer with their arkanaStats
    const healer = await prisma.user.findFirst({
      where: { slUuid: healer_uuid, universe: 'arkana' },
      include: { arkanaStats: true }
    });

    // Validate healer exists
    if (!healer) {
      return NextResponse.json(
        { success: false, error: 'Healer not found in Arkana universe' },
        { status: 404 }
      );
    }

    // Validate healer has completed Arkana character registration
    if (!healer.arkanaStats || !healer.arkanaStats.registrationCompleted) {
      return NextResponse.json(
        { success: false, error: 'Healer registration incomplete' },
        { status: 400 }
      );
    }

    // Get target with their arkanaStats and stats
    const target = await prisma.user.findFirst({
      where: { slUuid: target_uuid, universe: 'arkana' },
      include: {
        arkanaStats: true,
        stats: true
      }
    });

    // Validate target exists
    if (!target) {
      return NextResponse.json(
        { success: false, error: 'Target not found in Arkana universe' },
        { status: 404 }
      );
    }

    // Validate target has completed Arkana character registration
    if (!target.arkanaStats || !target.arkanaStats.registrationCompleted) {
      return NextResponse.json(
        { success: false, error: 'Target registration incomplete' },
        { status: 400 }
      );
    }

    // Check if healer has used first aid in the last 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const recentFirstAid = await prisma.event.findFirst({
      where: {
        userId: healer.id,
        type: 'FIRST_AID',
        timestamp: {
          gte: thirtyMinutesAgo
        }
      },
      orderBy: {
        timestamp: 'desc'
      }
    });

    if (recentFirstAid) {
      const cooldownRemaining = Math.ceil((30 * 60 * 1000 - (Date.now() - recentFirstAid.timestamp.getTime())) / 1000 / 60);
      return NextResponse.json(
        { success: false, error: `First aid on cooldown. ${cooldownRemaining} minutes remaining.` },
        { status: 400 }
      );
    }

    // First aid always succeeds if cooldown has passed - no dice rolling required
    const healingAmount = 1;

    // Get current target health
    const currentHealth = target.stats?.health || 0;
    const healthBefore = currentHealth;
    const healthAfter = Math.min(currentHealth + healingAmount, target.arkanaStats.hitPoints);

    // Update target health
    await prisma.userStats.update({
      where: { userId: target.id },
      data: { health: healthAfter }
    });

    // Record first aid event for cooldown tracking
    await prisma.event.create({
      data: {
        userId: healer.id,
        type: 'FIRST_AID',
        details: {
          targetUuid: target_uuid,
          targetName: target.arkanaStats.characterName,
          healingAmount,
          healthBefore,
          healthAfter
        }
      }
    });

    // Create result message
    const healerName = healer.arkanaStats.characterName;
    const targetName = target.arkanaStats.characterName;
    const resultMessage = `${healerName} successfully administers first aid to ${targetName}! Healed ${healingAmount} HP.`;

    // Return detailed result with string booleans for LSL compatibility
    return NextResponse.json({
      success: true,
      data: {
        isSuccess: "true",
        healingAmount,
        message: resultMessage,
        healer: {
          uuid: healer.slUuid,
          name: healerName
        },
        target: {
          uuid: target.slUuid,
          name: targetName,
          healthBefore,
          healthAfter
        }
      }
    });

  } catch (error: unknown) {
    console.error('Error processing first aid:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
