import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaPowerInfoSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { loadAllData, getAllCommonPowers, getAllArchPowers } from '@/lib/arkana/dataLoader';
import { encodeForLSL } from '@/lib/stringUtils';
import type { CommonPower, ArchetypePower } from '@/lib/arkana/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input using our validation schema
    const { error, value } = arkanaPowerInfoSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { player_uuid, power_id, power_name, universe, timestamp, signature } = value;

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

    // Load arkana data
    await loadAllData();
    const allCommonPowers = getAllCommonPowers();
    const allArchPowers = getAllArchPowers();

    // Find the power by ID or name
    let power: CommonPower | ArchetypePower | undefined = undefined;
    if (power_id) {
      power = allCommonPowers.find((p: CommonPower) => p.id === power_id) ||
              allArchPowers.find((p: ArchetypePower) => p.id === power_id);
    } else if (power_name) {
      power = allCommonPowers.find((p: CommonPower) => p.name.toLowerCase() === power_name.toLowerCase()) ||
              allArchPowers.find((p: ArchetypePower) => p.name.toLowerCase() === power_name.toLowerCase());
    }

    if (!power) {
      return NextResponse.json(
        { success: false, error: 'Power not found' },
        { status: 404 }
      );
    }

    // Verify the player owns this power
    const userCommonPowerIds = player.arkanaStats.commonPowers || [];
    const userArchPowerIds = player.arkanaStats.archetypePowers || [];
    const ownsPower = userCommonPowerIds.includes(power.id) || userArchPowerIds.includes(power.id);

    if (!ownsPower) {
      return NextResponse.json(
        { success: false, error: 'Player does not own this power' },
        { status: 403 }
      );
    }

    // Return power info
    return NextResponse.json({
      success: true,
      data: {
        id: power.id,
        name: encodeForLSL(power.name),
        description: encodeForLSL(power.desc || ''),
        targetType: power.targetType || 'single',
        baseStat: power.baseStat || 'Mental',
        range: power.range || 20,
        effects: power.effects || {},
        abilityType: power.abilityType || []
      }
    });

  } catch (error: unknown) {
    console.error('Error fetching power info:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
