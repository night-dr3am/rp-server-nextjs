// POST /api/gor/combat/end-turn - Process turn end for a player
// Decrements turn-based effects, applies healing, and updates stats

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateSignature } from '@/lib/signature';
import { gorEndTurnSchema } from '@/lib/validation';
import { encodeForLSL } from '@/lib/stringUtils';
import {
  processEffectsTurn,
  formatGorEffectsForLSL
} from '@/lib/gor/effectsUtils';
import type { ActiveEffect } from '@/lib/gor/types';
import type { GoreanStats } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const { error, value } = gorEndTurnSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { player_uuid, universe, timestamp, signature } = value;

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

    const goreanStats = user.goreanStats;

    // Parse current active effects
    const currentEffects = (goreanStats.activeEffects as unknown as ActiveEffect[]) || [];

    // Process turn - decrement effects, calculate healing
    const turnResult = await processEffectsTurn(
      currentEffects,
      goreanStats as GoreanStats
    );

    // Apply healing (cap at healthMax)
    let newHealth = goreanStats.healthCurrent;
    if (turnResult.healingApplied > 0) {
      newHealth = Math.min(
        goreanStats.healthCurrent + turnResult.healingApplied,
        goreanStats.healthMax
      );
    }

    // Update database
    await prisma.goreanStats.update({
      where: { id: goreanStats.id },
      data: {
        activeEffects: turnResult.activeEffects as unknown as object[],
        liveStats: turnResult.liveStats as unknown as object,
        healthCurrent: newHealth
      }
    });

    // Build complete display message with character name
    const displayParts: string[] = [];
    displayParts.push(`⏳ ${goreanStats.characterName} ended turn.`);

    if (turnResult.healingApplied > 0) {
      displayParts.push(`+${turnResult.healingApplied} HP healed.`);
    }

    displayParts.push(`HP: ${newHealth}/${goreanStats.healthMax}.`);

    if (turnResult.activeEffects.length > 0) {
      displayParts.push(`${turnResult.activeEffects.length} effects remaining.`);
    } else {
      displayParts.push(`No active effects.`);
    }

    const displayMessage = displayParts.join(' ');

    return NextResponse.json({
      success: true,
      data: {
        displayMessage: encodeForLSL(displayMessage),
        effectsRemaining: turnResult.activeEffects.length,
        effectsDisplay: encodeForLSL(formatGorEffectsForLSL(turnResult.activeEffects))
      }
    });
  } catch (error) {
    console.error('[GorEndTurn] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
