// GET/POST /api/gor/combat/user-abilities - Get player's available abilities
// Returns optimized list for LSL memory efficiency

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateSignature } from '@/lib/signature';
import { gorUserAbilitiesSchema } from '@/lib/validation';
import { encodeForLSL } from '@/lib/stringUtils';
import { loadAbilities } from '@/lib/gor/unifiedDataLoader';
import type { CharacterAbility, AbilityData } from '@/lib/gor/types';

interface AbilityListItem {
  id: string;
  name: string;
  abilityType: string;  // 'attack' | 'ability' | 'both'
}

async function handleRequest(body: Record<string, unknown>) {
  // Validate request
  const { error, value } = gorUserAbilitiesSchema.validate(body);
  if (error) {
    return NextResponse.json(
      { success: false, error: error.details[0].message },
      { status: 400 }
    );
  }

  const { player_uuid, type, universe, timestamp, signature } = value;

  // Validate signature
  const signatureValidation = validateSignature(timestamp, signature, universe);
  if (!signatureValidation.valid) {
    return NextResponse.json(
      { success: false, error: signatureValidation.error },
      { status: 401 }
    );
  }

  // Get user with goreanStats
  const user = await prisma.user.findFirst({
    where: {
      slUuid: player_uuid,
      universe: {
        equals: universe,
        mode: 'insensitive'
      }
    },
    include: {
      goreanStats: true
    }
  });

  if (!user) {
    return NextResponse.json(
      { success: false, error: 'User not found' },
      { status: 404 }
    );
  }

  if (!user.goreanStats) {
    return NextResponse.json(
      { success: false, error: 'Character not found' },
      { status: 404 }
    );
  }

  // Get user's learned abilities
  const characterAbilities = (user.goreanStats.abilities as unknown as CharacterAbility[]) || [];

  if (characterAbilities.length === 0) {
    return NextResponse.json({
      success: true,
      data: {
        abilities: []
      }
    });
  }

  // Load all ability definitions
  const allAbilities = await loadAbilities();

  // Build optimized ability list
  const abilities: AbilityListItem[] = [];

  for (const charAbility of characterAbilities) {
    const abilityDef = allAbilities.find((a: AbilityData) => a.id === charAbility.ability_id);

    if (abilityDef) {
      // Determine ability type for routing
      const hasAttack = abilityDef.abilityType.includes('attack');
      const hasAbility = abilityDef.abilityType.includes('ability');
      let abilityType = 'ability';

      if (hasAttack && hasAbility) {
        abilityType = 'both';
      } else if (hasAttack) {
        abilityType = 'attack';
      }

      // Filter by type if specified
      if (type) {
        if (type === 'attack' && !hasAttack) continue;
        if (type === 'ability' && !hasAbility) continue;
      }

      abilities.push({
        id: abilityDef.id,
        name: encodeForLSL(abilityDef.name),
        abilityType
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      abilities
    }
  });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const body: Record<string, unknown> = {};

    // Extract query parameters
    for (const [key, value] of searchParams.entries()) {
      body[key] = value;
    }

    return handleRequest(body);
  } catch (error) {
    console.error('[UserAbilities] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return handleRequest(body);
  } catch (error) {
    console.error('[UserAbilities] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
