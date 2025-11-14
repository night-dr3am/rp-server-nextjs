import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { goreanStatsSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { encodeForLSL } from '@/lib/stringUtils';

// GET /api/gor/stats - Retrieve Gorean character statistics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sl_uuid = searchParams.get('sl_uuid');
    const universe = searchParams.get('universe');
    const timestamp = searchParams.get('timestamp');
    const signature = searchParams.get('signature');

    // Validate input using our validation schema
    const { error } = goreanStatsSchema.validate({ sl_uuid, universe, timestamp, signature });
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    // Ensure universe is gor (case-insensitive)
    const universeStr = universe!.toLowerCase();
    if (universeStr !== 'gor') {
      return NextResponse.json(
        { success: false, error: 'This endpoint is only for Gor universe' },
        { status: 400 }
      );
    }

    // Validate signature
    const signatureValidation = validateSignature(timestamp!, signature!, universe!);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find user and include their stats and gorean stats
    const user = await prisma.user.findFirst({
      where: {
        slUuid: sl_uuid!,
        universe: {
          equals: universe!,
          mode: 'insensitive' // Case-insensitive match for "Gor" or "gor"
        }
      },
      include: {
        stats: true,
        goreanStats: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found in Gor universe' },
        { status: 404 }
      );
    }

    // Check if user has completed Gorean character registration
    if (!user.goreanStats || !user.goreanStats.registrationCompleted) {
      return NextResponse.json(
        { success: false, error: 'User registration incomplete' },
        { status: 404 }
      );
    }

    // Update last active timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() }
    });

    // Return user data with nested structure (matching Arkana pattern)
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          slUuid: user.slUuid,
          username: encodeForLSL(user.username),
          role: user.role,
          universe: user.universe,
          title: encodeForLSL(user.title),
          titleColor: user.titleColor,
          createdAt: user.createdAt,
          lastActive: user.lastActive
        },
        stats: user.stats ? {
          status: user.stats.status,  // Generic RPG status (not social status)
          lastUpdated: user.stats.lastUpdated
          // health, hunger, thirst, coins: use goreanStats equivalents instead
        } : null,
        goreanStats: user.goreanStats ? {
          id: user.goreanStats.id,
          // Identity (Step 1)
          characterName: encodeForLSL(user.goreanStats.characterName),
          agentName: encodeForLSL(user.goreanStats.agentName),
          title: encodeForLSL(user.goreanStats.title),
          // background: EXCLUDED (TEXT field too large for LSL)

          // Taxonomy (Steps 2-6)
          species: encodeForLSL(user.goreanStats.species),
          speciesCategory: encodeForLSL(user.goreanStats.speciesCategory),
          speciesVariant: encodeForLSL(user.goreanStats.speciesVariant),
          culture: encodeForLSL(user.goreanStats.culture),
          cultureType: encodeForLSL(user.goreanStats.cultureType),
          status: encodeForLSL(user.goreanStats.status),
          statusSubtype: encodeForLSL(user.goreanStats.statusSubtype),
          casteRole: encodeForLSL(user.goreanStats.casteRole),
          casteRoleType: encodeForLSL(user.goreanStats.casteRoleType),
          region: encodeForLSL(user.goreanStats.region),
          homeStoneName: encodeForLSL(user.goreanStats.homeStoneName),

          // Base Stats (Step 7)
          strength: user.goreanStats.strength,
          agility: user.goreanStats.agility,
          intellect: user.goreanStats.intellect,
          perception: user.goreanStats.perception,
          charisma: user.goreanStats.charisma,
          statPointsPool: user.goreanStats.statPointsPool,
          statPointsSpent: user.goreanStats.statPointsSpent,

          // Derived Stats
          healthMax: user.goreanStats.healthMax,
          hungerMax: user.goreanStats.hungerMax,
          thirstMax: user.goreanStats.thirstMax,

          // Current State
          healthCurrent: user.goreanStats.healthCurrent,
          hungerCurrent: user.goreanStats.hungerCurrent,
          thirstCurrent: user.goreanStats.thirstCurrent,

          // Economy
          goldCoin: user.goreanStats.goldCoin,
          silverCoin: user.goreanStats.silverCoin,
          copperCoin: user.goreanStats.copperCoin,
          xp: user.goreanStats.xp,

          // Active Effects & Live Stats
          activeEffects: user.goreanStats.activeEffects,
          liveStats: user.goreanStats.liveStats,

          // skills: EXCLUDED (JSON array too large for LSL)
          // abilities: EXCLUDED (JSON array too large for LSL)

          // Point allocations (for display)
          skillsAllocatedPoints: user.goreanStats.skillsAllocatedPoints,
          skillsSpentPoints: user.goreanStats.skillsSpentPoints,

          // Metadata
          registrationCompleted: user.goreanStats.registrationCompleted,
          gorRole: user.goreanStats.gorRole,
          createdAt: user.goreanStats.createdAt
        } : null,
        hasGoreanCharacter: !!user.goreanStats && user.goreanStats.registrationCompleted ? "true" : "false"  // String for LSL compatibility
      }
    });

  } catch (error: unknown) {
    console.error('Error getting Gorean stats:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
