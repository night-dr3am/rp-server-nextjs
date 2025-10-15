import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaUserPowersSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { loadAllData, getAllCommonPowers, getAllArchPowers, getAllPerks, getAllCybernetics, getAllMagicSchools } from '@/lib/arkana/dataLoader';
import { encodeForLSL } from '@/lib/stringUtils';
import type { CommonPower, ArchetypePower, Perk, Cybernetic, MagicSchool } from '@/lib/arkana/types';

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

    const { player_uuid, universe, type, timestamp, signature } = value;

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

    // Get user's ability IDs (powers, perks, cybernetics, magic)
    const userCommonPowerIds = (player.arkanaStats.commonPowers as string[]) || [];
    const userArchPowerIds = (player.arkanaStats.archetypePowers as string[]) || [];
    const userPerkIds = (player.arkanaStats.perks as string[]) || [];
    const userCyberneticIds = (player.arkanaStats.cybernetics as string[]) || [];
    const userMagicWeaveIds = (player.arkanaStats.magicWeaves as string[]) || [];

    // Filter abilities based on type (attack or ability)
    // Memory-optimized: return only id, name, and abilityType (details fetched via power-info)
    const powerType = type || 'attack';
    const filteredPowers: Array<{
      id: string;
      name: string;
      abilityType: string; // commonPower, archetypePower, perk, cybernetic, magicWeave
    }> = [];

    // Process common powers
    userCommonPowerIds.forEach((powerId: string) => {
      const power = allCommonPowers.find((p: CommonPower) => p.id === powerId);
      if (power && power.abilityType && power.abilityType.includes(powerType)) {
        filteredPowers.push({
          id: power.id,
          name: power.name,
          abilityType: 'commonPower'
        });
      }
    });

    // Process archetype powers
    userArchPowerIds.forEach((powerId: string) => {
      const power = allArchPowers.find((p: ArchetypePower) => p.id === powerId);
      if (power && power.abilityType && power.abilityType.includes(powerType)) {
        filteredPowers.push({
          id: power.id,
          name: power.name,
          abilityType: 'archetypePower'
        });
      }
    });

    // Process perks (only those with attack or ability effects)
    userPerkIds.forEach((perkId: string) => {
      const perk = allPerks.find((p: Perk) => p.id === perkId);
      if (perk && perk.abilityType && perk.abilityType.includes(powerType)) {
        filteredPowers.push({
          id: perk.id,
          name: perk.name,
          abilityType: 'perk'
        });
      }
    });

    // Process cybernetics (only those with attack or ability effects)
    userCyberneticIds.forEach((cyberId: string) => {
      const cyber = allCybernetics.find((c: Cybernetic) => c.id === cyberId);
      if (cyber && cyber.abilityType && cyber.abilityType.includes(powerType)) {
        filteredPowers.push({
          id: cyber.id,
          name: cyber.name,
          abilityType: 'cybernetic'
        });
      }
    });

    // Process magic weaves (only those with attack or ability effects)
    userMagicWeaveIds.forEach((weaveId: string) => {
      const weave = allMagicSchools.find((m: MagicSchool) => m.id === weaveId);
      if (weave && weave.abilityType && weave.abilityType.includes(powerType)) {
        filteredPowers.push({
          id: weave.id,
          name: weave.name,
          abilityType: 'magicWeave'
        });
      }
    });

    // Return the filtered list of abilities (id, name, and abilityType for routing)
    return NextResponse.json({
      success: true,
      data: {
        powers: filteredPowers.map(p => ({
          id: p.id,
          name: encodeForLSL(p.name),
          abilityType: p.abilityType // Helps LSL route to correct activation endpoint
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
