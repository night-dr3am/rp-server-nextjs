import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaPowerInfoSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { loadAllData, getAllCommonPowers, getAllArchPowers, getAllPerks, getAllCybernetics, getAllMagicSchools } from '@/lib/arkana/dataLoader';
import { encodeForLSL } from '@/lib/stringUtils';
import type { CommonPower, ArchetypePower, Perk, Cybernetic, MagicSchool } from '@/lib/arkana/types';

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
    const allPerks = getAllPerks();
    const allCybernetics = getAllCybernetics();
    const allMagicSchools = getAllMagicSchools();

    // Find the ability by ID or name (search in all ability types)
    let ability: CommonPower | ArchetypePower | Perk | Cybernetic | MagicSchool | undefined = undefined;

    if (power_id) {
      // Search by ID: common powers → archetype powers → perks → cybernetics → magic weaves
      ability = allCommonPowers.find((p: CommonPower) => p.id === power_id) ||
                allArchPowers.find((p: ArchetypePower) => p.id === power_id) ||
                allPerks.find((p: Perk) => p.id === power_id) ||
                allCybernetics.find((c: Cybernetic) => c.id === power_id) ||
                allMagicSchools.find((m: MagicSchool) => m.id === power_id);
    } else if (power_name) {
      // Search by name (case-insensitive): common powers → archetype powers → perks → cybernetics → magic weaves
      const lowerName = power_name.toLowerCase();
      ability = allCommonPowers.find((p: CommonPower) => p.name.toLowerCase() === lowerName) ||
                allArchPowers.find((p: ArchetypePower) => p.name.toLowerCase() === lowerName) ||
                allPerks.find((p: Perk) => p.name.toLowerCase() === lowerName) ||
                allCybernetics.find((c: Cybernetic) => c.name.toLowerCase() === lowerName) ||
                allMagicSchools.find((m: MagicSchool) => m.name.toLowerCase() === lowerName);
    }

    if (!ability) {
      return NextResponse.json(
        { success: false, error: 'Ability not found' },
        { status: 404 }
      );
    }

    // Verify the player owns this ability (check all ability types with type casting)
    const userCommonPowerIds = (player.arkanaStats.commonPowers as string[]) || [];
    const userArchPowerIds = (player.arkanaStats.archetypePowers as string[]) || [];
    const userPerkIds = (player.arkanaStats.perks as string[]) || [];
    const userCyberneticIds = (player.arkanaStats.cybernetics as string[]) || [];
    const userMagicWeaveIds = (player.arkanaStats.magicWeaves as string[]) || [];

    const ownsAbility = userCommonPowerIds.includes(ability.id) ||
                        userArchPowerIds.includes(ability.id) ||
                        userPerkIds.includes(ability.id) ||
                        userCyberneticIds.includes(ability.id) ||
                        userMagicWeaveIds.includes(ability.id);

    if (!ownsAbility) {
      return NextResponse.json(
        { success: false, error: 'Player does not own this ability' },
        { status: 403 }
      );
    }

    // Return ability info
    return NextResponse.json({
      success: true,
      data: {
        id: ability.id,
        name: encodeForLSL(ability.name),
        description: encodeForLSL(ability.desc || ''),
        targetType: ability.targetType || 'single',
        baseStat: ability.baseStat || 'Mental',
        range: ability.range || 20,
        effects: ability.effects || {},
        abilityType: ability.abilityType || []
      }
    });

  } catch (error: unknown) {
    console.error('Error fetching ability info:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
