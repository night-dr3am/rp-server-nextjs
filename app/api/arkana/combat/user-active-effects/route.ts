import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaUserActiveEffectsSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { encodeForLSL } from '@/lib/stringUtils';
import { parseActiveEffects } from '@/lib/arkana/effectsUtils';
import { loadAllData, getEffectDefinition } from '@/lib/arkana/dataLoader';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input using our validation schema
    const { error, value } = arkanaUserActiveEffectsSchema.validate(body);
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

    // Load effect definitions (needed to check duration)
    await loadAllData();

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

    // Parse activeEffects and filter to deactivatable effects
    const activeEffects = parseActiveEffects(player.arkanaStats.activeEffects);
    const playerName = player.arkanaStats.characterName;

    // Filter to only scene-based, self-cast effects
    const deactivatableEffects = activeEffects.filter(effect => {
      const effectDef = getEffectDefinition(effect.effectId);

      // Must be scene-based (not turn-based or permanent)
      if (effectDef?.duration !== 'scene') {
        return false;
      }

      // Must be self-cast (or no caster specified, which means self)
      if (effect.casterName && effect.casterName !== playerName) {
        return false;
      }

      return true;
    });

    // Return memory-optimized list (id and name only, like user-powers endpoint)
    const effects = deactivatableEffects.map(effect => ({
      id: effect.effectId,
      name: encodeForLSL(effect.name)
    }));

    return NextResponse.json({
      success: true,
      data: { effects }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('Error fetching user active effects:', errorMessage);
    console.error('Stack:', errorStack);
    return NextResponse.json(
      { success: false, error: `Internal server error: ${errorMessage}` },
      { status: 500 }
    );
  }
}
