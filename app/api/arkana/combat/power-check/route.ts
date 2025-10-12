import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaPowerCheckSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { encodeForLSL } from '@/lib/stringUtils';
import { parseActiveEffects, processEffectsTurn, buildArkanaStatsUpdate, getEffectiveStatModifier } from '@/lib/arkana/effectsUtils';
import type { LiveStats } from '@/lib/arkana/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input using our validation schema
    const { error, value } = arkanaPowerCheckSchema.validate(body);
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

    // Get player with their arkanaStats
    const player = await prisma.user.findFirst({
      where: { slUuid: player_uuid, universe: 'arkana' },
      include: { arkanaStats: true }
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

    // Parse liveStats for player to include active effect modifiers
    const playerLiveStats = (player.arkanaStats.liveStats as LiveStats) || {};

    // Calculate effective mental modifier (includes buffs/debuffs)
    const mentalMod = getEffectiveStatModifier(player.arkanaStats, playerLiveStats, 'mental');
    const mentalStat = player.arkanaStats.mental;

    // Roll D20 + mental modifier
    const d20Roll = Math.floor(Math.random() * 20) + 1;
    const totalRoll = d20Roll + mentalMod;
    const targetNumber = 12;

    // Determine success/failure
    const isSuccess = totalRoll >= targetNumber;

    // Create result message
    const playerName = player.arkanaStats.characterName;
    const resultMessage = isSuccess
      ? `${playerName} succeeds on power check! (Roll: ${d20Roll}+${mentalMod}=${totalRoll} vs TN:${targetNumber})`
      : `${playerName} fails power check. (Roll: ${d20Roll}+${mentalMod}=${totalRoll} vs TN:${targetNumber})`;

    // Process turn for player (decrement all activeEffects by 1 turn)
    const playerActiveEffects = parseActiveEffects(player.arkanaStats.activeEffects);
    const turnProcessed = processEffectsTurn(playerActiveEffects, player.arkanaStats);

    await prisma.arkanaStats.update({
      where: { userId: player.id },
      data: buildArkanaStatsUpdate({
        activeEffects: turnProcessed.activeEffects,
        liveStats: turnProcessed.liveStats
      })
    });

    // Return detailed result with string booleans for LSL compatibility
    return NextResponse.json({
      success: true,
      data: {
        isSuccess: isSuccess ? "true" : "false",
        d20Roll,
        mentalMod,
        totalRoll,
        targetNumber,
        mentalStat,
        message: encodeForLSL(resultMessage),
        player: {
          uuid: player.slUuid,
          name: encodeForLSL(playerName)
        }
      }
    });

  } catch (error: unknown) {
    console.error('Error processing power check:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
