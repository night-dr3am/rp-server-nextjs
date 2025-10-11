import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaUserPowersSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { loadAllData, getAllCommonPowers, getAllArchPowers } from '@/lib/arkana/dataLoader';
import { encodeForLSL } from '@/lib/stringUtils';
import type { CommonPower, ArchetypePower } from '@/lib/arkana/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input using our validation schema
    const { error, value } = arkanaUserPowersSchema.validate(body);
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

    // Load arkana data
    await loadAllData();
    const allCommonPowers = getAllCommonPowers();
    const allArchPowers = getAllArchPowers();

    // Get user's power IDs
    const userCommonPowerIds = player.arkanaStats.commonPowers || [];
    const userArchPowerIds = player.arkanaStats.archetypePowers || [];

    // Filter and map user's powers to include only attack powers
    // Memory-optimized: return only id and name (details fetched via power-info)
    const attackPowers: Array<{
      id: string;
      name: string;
    }> = [];

    // Process common powers
    userCommonPowerIds.forEach((powerId: string) => {
      const power = allCommonPowers.find((p: CommonPower) => p.id === powerId);
      if (power && power.abilityType && power.abilityType.includes('attack')) {
        attackPowers.push({
          id: power.id,
          name: power.name
        });
      }
    });

    // Process archetype powers
    userArchPowerIds.forEach((powerId: string) => {
      const power = allArchPowers.find((p: ArchetypePower) => p.id === powerId);
      if (power && power.abilityType && power.abilityType.includes('attack')) {
        attackPowers.push({
          id: power.id,
          name: power.name
        });
      }
    });

    // Return the list of attack powers (id and name only for memory optimization)
    return NextResponse.json({
      success: true,
      data: {
        powers: attackPowers.map(p => ({
          id: p.id,
          name: encodeForLSL(p.name)
        }))
      }
    });

  } catch (error: unknown) {
    console.error('Error fetching user powers:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
