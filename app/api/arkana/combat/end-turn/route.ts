import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaEndTurnSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { encodeForLSL } from '@/lib/stringUtils';
import { parseActiveEffects, processEffectsTurnAndApplyHealing, buildArkanaStatsUpdate } from '@/lib/arkana/effectsUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input using our validation schema
    const { error, value } = arkanaEndTurnSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { player_uuid, universe, timestamp, signature } = value;

    // Validate signature for Arkana universe
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get player with their arkanaStats and stats
    const player = await prisma.user.findFirst({
      where: { slUuid: player_uuid, universe: 'arkana' },
      include: { arkanaStats: true, stats: true }
    });

    // Validate player exists
    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found in Arkana universe' },
        { status: 404 }
      );
    }

    // Validate player has completed Arkana character registration
    if (!player.arkanaStats || !player.arkanaStats.registrationCompleted) {
      return NextResponse.json(
        { success: false, error: 'Player registration incomplete' },
        { status: 400 }
      );
    }

    // Check if player is in RP mode (status === 0 means IC/RP mode)
    if (!player.stats || player.stats.status !== 0) {
      return NextResponse.json(
        { success: false, error: 'Player is not in RP mode' },
        { status: 400 }
      );
    }

    // Parse activeEffects, process turn, and apply healing in one operation
    const activeEffects = parseActiveEffects(player.arkanaStats.activeEffects);
    const currentHP = player.stats?.health || 0;
    const maxHP = player.arkanaStats.physical * 5;

    const turnProcessed = await processEffectsTurnAndApplyHealing(
      player as typeof player & { arkanaStats: NonNullable<typeof player.arkanaStats> },
      activeEffects,
      0  // No immediate healing in end-turn
    );

    // Update database with new activeEffects and liveStats
    await prisma.arkanaStats.update({
      where: { userId: player.id },
      data: buildArkanaStatsUpdate({
        activeEffects: turnProcessed.activeEffects,
        liveStats: turnProcessed.liveStats
      })
    });

    // Return success with effect count and healing info
    const playerName = player.arkanaStats.characterName;
    const effectsRemaining = turnProcessed.activeEffects.length;

    let message = `Turn ended. ${effectsRemaining} active effects remaining.`;

    if (turnProcessed.healingApplied > 0) {
      const actualHealing = turnProcessed.newHP - currentHP;
      message += ` Healed ${actualHealing} HP from: ${turnProcessed.healEffectNames.join(', ')}.`;
    }

    return NextResponse.json({
      success: true,
      data: {
        playerName: encodeForLSL(playerName),
        effectsRemaining,
        healingApplied: turnProcessed.healingApplied,
        currentHP: turnProcessed.newHP,
        maxHP: maxHP,
        message: encodeForLSL(message)
      }
    });

  } catch (error: unknown) {
    console.error('Error processing end turn:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
