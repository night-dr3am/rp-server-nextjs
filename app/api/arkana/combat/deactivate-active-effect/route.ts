import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaDeactivateActiveEffectSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { encodeForLSL } from '@/lib/stringUtils';
import { parseActiveEffects, processEffectsTurn, buildArkanaStatsUpdate } from '@/lib/arkana/effectsUtils';
import { loadAllData, getEffectDefinition } from '@/lib/arkana/dataLoader';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input using our validation schema
    const { error, value } = arkanaDeactivateActiveEffectSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { player_uuid, effect_id, universe, timestamp, signature } = value;

    // Validate signature for Arkana universe
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Load effect definitions (needed to check duration and process turns)
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

    // Parse activeEffects and find the effect to deactivate
    const activeEffects = parseActiveEffects(player.arkanaStats.activeEffects);
    const playerName = player.arkanaStats.characterName;

    // Find the effect by effectId
    const effectIndex = activeEffects.findIndex(e => e.effectId === effect_id);
    if (effectIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Effect not found in active effects' },
        { status: 404 }
      );
    }

    const effectToDeactivate = activeEffects[effectIndex];
    const effectDef = getEffectDefinition(effect_id);

    // Validate effect is scene-based (not turn-based)
    if (effectDef?.duration !== 'scene') {
      return NextResponse.json(
        { success: false, error: 'Cannot deactivate turn-based effects' },
        { status: 400 }
      );
    }

    // Validate effect is self-cast
    if (effectToDeactivate.casterName && effectToDeactivate.casterName !== playerName) {
      return NextResponse.json(
        { success: false, error: 'Cannot deactivate effects cast by others' },
        { status: 403 }
      );
    }

    // Remove the effect from activeEffects
    const updatedEffects = activeEffects.filter((_, index) => index !== effectIndex);

    // Process turn (decrement other turn-based effects, leaving scene effects intact)
    const turnProcessed = processEffectsTurn(updatedEffects, player.arkanaStats);

    // Update database with new activeEffects and liveStats
    await prisma.arkanaStats.update({
      where: { userId: player.id },
      data: buildArkanaStatsUpdate({
        activeEffects: turnProcessed.activeEffects,
        liveStats: turnProcessed.liveStats
      })
    });

    // Return success with effect counts
    const effectsRemaining = turnProcessed.activeEffects.length;
    const effectName = effectToDeactivate.name;

    return NextResponse.json({
      success: true,
      data: {
        playerName: encodeForLSL(playerName),
        effectDeactivated: encodeForLSL(effectName),
        effectsRemaining,
        message: encodeForLSL(`Deactivated ${effectName}. Effects remaining: ${effectsRemaining}. Turn used.`)
      }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('Error deactivating active effect:', errorMessage);
    console.error('Stack:', errorStack);
    return NextResponse.json(
      { success: false, error: `Internal server error: ${errorMessage}` },
      { status: 500 }
    );
  }
}
