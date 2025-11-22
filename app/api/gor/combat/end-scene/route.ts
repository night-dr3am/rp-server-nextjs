// POST /api/gor/combat/end-scene - Clear all temporary effects at scene end
// Removes all turn-based and scene-long effects

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateSignature } from '@/lib/signature';
import { gorEndSceneSchema } from '@/lib/validation';
import { encodeForLSL } from '@/lib/stringUtils';
import {
  clearSceneEffects,
  formatGorEffectsForLSL
} from '@/lib/gor/effectsUtils';
import type { ActiveEffect } from '@/lib/gor/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const { error, value } = gorEndSceneSchema.validate(body);
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
    const effectsCount = currentEffects.length;

    // Clear all scene effects (returns only permanent effects, if any)
    const sceneResult = await clearSceneEffects(currentEffects);

    // Update database
    await prisma.goreanStats.update({
      where: { id: goreanStats.id },
      data: {
        activeEffects: sceneResult.activeEffects as unknown as object[],
        liveStats: sceneResult.liveStats as unknown as object
      }
    });

    // Calculate effects removed
    const effectsRemoved = effectsCount - sceneResult.activeEffects.length;

    // Build complete display message with character name
    const displayParts: string[] = [];
    displayParts.push(`⏳ ${goreanStats.characterName} ended scene.`);

    if (effectsRemoved > 0) {
      displayParts.push(`${effectsRemoved} effects cleared.`);
    } else {
      displayParts.push(`No effects to clear.`);
    }

    const displayMessage = displayParts.join(' ');

    return NextResponse.json({
      success: true,
      data: {
        displayMessage: encodeForLSL(displayMessage),
        effectsRemaining: sceneResult.activeEffects.length,
        effectsDisplay: encodeForLSL(formatGorEffectsForLSL(sceneResult.activeEffects))
      }
    });
  } catch (error) {
    console.error('[GorEndScene] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
