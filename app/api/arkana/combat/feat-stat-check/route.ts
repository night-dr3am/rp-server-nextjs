import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaFeatStatCheckSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { calculateStatModifier } from '@/lib/arkana/types';

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

    // Get the appropriate stat value based on stat_type
    let statValue: number;
    let statName: string;

    switch (stat_type) {
      case 'physical':
        statValue = player.arkanaStats.physical;
        statName = 'Physical';
        break;
      case 'dexterity':
        statValue = player.arkanaStats.dexterity;
        statName = 'Dexterity';
        break;
      case 'mental':
        statValue = player.arkanaStats.mental;
        statName = 'Mental';
        break;
      case 'perception':
        statValue = player.arkanaStats.perception;
        statName = 'Perception';
        break;
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid stat type' },
          { status: 400 }
        );
    }

    // Calculate stat modifier using proper stat modifier calculation
    const statModifier = calculateStatModifier(statValue);

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
        message: resultMessage,
        player: {
          uuid: player.slUuid,
          name: playerName
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
