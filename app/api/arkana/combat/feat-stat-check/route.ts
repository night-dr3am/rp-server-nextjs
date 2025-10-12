import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaFeatStatCheckSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { encodeForLSL } from '@/lib/stringUtils';
import { parseActiveEffects, processEffectsTurn, buildArkanaStatsUpdate, getEffectiveStatModifier } from '@/lib/arkana/effectsUtils';
import type { LiveStats } from '@/lib/arkana/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input using our validation schema
    const { error, value } = arkanaFeatStatCheckSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { player_uuid, stat_type, target_number, universe, timestamp, signature } = value;

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

    // Parse liveStats for player to include active effect modifiers
    const playerLiveStats = (player.arkanaStats.liveStats as LiveStats) || {};

    // Get the appropriate stat value and calculate effective modifier (includes buffs/debuffs)
    let statModifier: number;
    let statName: string;
    let statValue: number;

    switch (stat_type) {
      case 'physical':
        statModifier = getEffectiveStatModifier(player.arkanaStats, playerLiveStats, 'physical');
        statValue = player.arkanaStats.physical;
        statName = 'Physical';
        break;
      case 'dexterity':
        statModifier = getEffectiveStatModifier(player.arkanaStats, playerLiveStats, 'dexterity');
        statValue = player.arkanaStats.dexterity;
        statName = 'Dexterity';
        break;
      case 'mental':
        statModifier = getEffectiveStatModifier(player.arkanaStats, playerLiveStats, 'mental');
        statValue = player.arkanaStats.mental;
        statName = 'Mental';
        break;
      case 'perception':
        statModifier = getEffectiveStatModifier(player.arkanaStats, playerLiveStats, 'perception');
        statValue = player.arkanaStats.perception;
        statName = 'Perception';
        break;
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid stat type' },
          { status: 400 }
        );
    }

    // Roll D20 + stat modifier
    const d20Roll = Math.floor(Math.random() * 20) + 1;
    const totalRoll = d20Roll + statModifier;

    // Determine success/failure
    const isSuccess = totalRoll >= target_number;

    // Create result message
    const playerName = player.arkanaStats.characterName;
    const resultMessage = isSuccess
      ? `${playerName} succeeds on ${statName} check! (Roll: ${d20Roll}+${statModifier}=${totalRoll} vs TN:${target_number})`
      : `${playerName} fails ${statName} check. (Roll: ${d20Roll}+${statModifier}=${totalRoll} vs TN:${target_number})`;

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
        statModifier,
        totalRoll,
        targetNumber: target_number,
        statType: stat_type,
        statValue,
        message: encodeForLSL(resultMessage),
        player: {
          uuid: player.slUuid,
          name: encodeForLSL(playerName)
        }
      }
    });

  } catch (error: unknown) {
    console.error('Error processing feat stat check:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
