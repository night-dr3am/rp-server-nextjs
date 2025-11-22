// POST /api/gor/combat/defend - Take defensive stance
// Applies +5 roll bonus to all stats for 1 turn

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateSignature } from '@/lib/signature';
import { gorDefendSchema } from '@/lib/validation';
import { encodeForLSL } from '@/lib/stringUtils';
import { getEffectById } from '@/lib/gor/unifiedDataLoader';
import {
  executeEffect,
  applyActiveEffect,
  recalculateLiveStats,
  formatGorEffectsForLSL,
  canPerformCombatAction
} from '@/lib/gor/effectsUtils';
import type { ActiveEffect } from '@/lib/gor/types';

const DEFENSE_EFFECT_ID = 'buff_defense_all_5';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const { error, value } = gorDefendSchema.validate(body);
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

    // Check player is conscious
    if (goreanStats.healthCurrent <= 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot defend while unconscious' },
        { status: 400 }
      );
    }

    // Parse current active effects and check for control effects
    const currentEffects = (goreanStats.activeEffects as unknown as ActiveEffect[]) || [];
    const liveStats = await recalculateLiveStats(currentEffects);

    const actionCheck = canPerformCombatAction(liveStats);
    if (!actionCheck.can) {
      return NextResponse.json(
        { success: false, error: actionCheck.reason },
        { status: 400 }
      );
    }

    // Load defense effect
    const effectDef = await getEffectById(DEFENSE_EFFECT_ID);
    if (!effectDef) {
      console.error('[GorDefend] Defense effect not found:', DEFENSE_EFFECT_ID);
      return NextResponse.json(
        { success: false, error: 'Defense effect not configured' },
        { status: 500 }
      );
    }

    // Execute effect to get result
    const effectResult = await executeEffect(
      DEFENSE_EFFECT_ID,
      goreanStats,
      goreanStats  // Self-target
    );

    if (!effectResult) {
      return NextResponse.json(
        { success: false, error: 'Failed to apply defense effect' },
        { status: 500 }
      );
    }

    // Apply effect to active effects
    const newActiveEffects = applyActiveEffect(
      currentEffects,
      effectResult,
      goreanStats.characterName,
      {
        sourceId: 'defend_action',
        sourceName: 'Defend',
        sourceType: 'ability'
      }
    );

    // Recalculate live stats with new effect
    const newLiveStats = await recalculateLiveStats(newActiveEffects);

    // Update database
    await prisma.goreanStats.update({
      where: { id: goreanStats.id },
      data: {
        activeEffects: newActiveEffects as unknown as object[],
        liveStats: newLiveStats as unknown as object,
        updatedAt: new Date()
      }
    });

    // Build display message
    const displayMessage = `🛡️ ${goreanStats.characterName} takes a defensive stance. All stats +5 for 1 turn.`;

    return NextResponse.json({
      success: true,
      data: {
        displayMessage: encodeForLSL(displayMessage),
        effectsDisplay: encodeForLSL(formatGorEffectsForLSL(newActiveEffects)),
        effectsCount: newActiveEffects.length
      }
    });
  } catch (error) {
    console.error('[GorDefend] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
