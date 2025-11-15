import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { goreanUpdateStatsSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { encodeForLSL } from '@/lib/stringUtils';

// POST /api/gor/stats/update - Update Gorean character statistics
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input using our validation schema
    const { error, value } = goreanUpdateStatsSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { sl_uuid, universe, healthCurrent, hungerCurrent, thirstCurrent, goldCoin, silverCoin, copperCoin, timestamp, signature } = value;

    // Ensure universe is gor (case-insensitive)
    const universeStr = universe.toLowerCase();
    if (universeStr !== 'gor') {
      return NextResponse.json(
        { success: false, error: 'This endpoint is only for Gor universe' },
        { status: 400 }
      );
    }

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find user and include their stats and gorean stats
    const user = await prisma.user.findFirst({
      where: {
        slUuid: sl_uuid,
        universe: {
          equals: universe,
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

    // Prepare update data for GoreanStats (health/hunger/thirst only)
    const goreanUpdateData: {
      healthCurrent?: number;
      hungerCurrent?: number;
      thirstCurrent?: number;
      updatedAt: Date;
    } = {
      updatedAt: new Date()
    };

    // Prepare update data for UserStats (health/hunger/thirst for sync + coins)
    const userStatsUpdateData: {
      health?: number;
      hunger?: number;
      thirst?: number;
      goldCoin?: number;
      silverCoin?: number;
      copperCoin?: number;
      lastUpdated: Date;
    } = {
      lastUpdated: new Date()
    };

    // Clamp health to valid range (0 to healthMax)
    if (healthCurrent !== undefined) {
      const clampedHealth = Math.max(0, Math.min(user.goreanStats.healthMax, healthCurrent));
      goreanUpdateData.healthCurrent = clampedHealth;
      userStatsUpdateData.health = clampedHealth; // Sync to UserStats
    }

    // Clamp hunger and thirst to valid ranges (0-100)
    if (hungerCurrent !== undefined) {
      const clampedHunger = Math.max(0, Math.min(100, hungerCurrent));
      goreanUpdateData.hungerCurrent = clampedHunger;
      userStatsUpdateData.hunger = clampedHunger; // Sync to UserStats
    }

    if (thirstCurrent !== undefined) {
      const clampedThirst = Math.max(0, Math.min(100, thirstCurrent));
      goreanUpdateData.thirstCurrent = clampedThirst;
      userStatsUpdateData.thirst = clampedThirst; // Sync to UserStats
    }

    // Update currency fields in UserStats (authoritative source, no clamping)
    if (goldCoin !== undefined) userStatsUpdateData.goldCoin = goldCoin;
    if (silverCoin !== undefined) userStatsUpdateData.silverCoin = silverCoin;
    if (copperCoin !== undefined) userStatsUpdateData.copperCoin = copperCoin;

    // Update Gorean stats (health/hunger/thirst only)
    const updatedStats = await prisma.goreanStats.update({
      where: {
        userId: user.id
      },
      data: goreanUpdateData
    });

    // Update UserStats (health/hunger/thirst for sync + coins as authoritative)
    const updatedUserStats = await prisma.userStats.update({
      where: {
        userId: user.id
      },
      data: userStatsUpdateData
    });

    // Update user's last active timestamp
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() },
      include: {
        stats: true,
        goreanStats: true
      }
    });

    // Return user data with nested structure (matching GET endpoint pattern)
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: updatedUser.id,
          slUuid: updatedUser.slUuid,
          username: encodeForLSL(updatedUser.username),
          role: updatedUser.role,
          universe: updatedUser.universe,
          title: encodeForLSL(updatedUser.title),
          titleColor: updatedUser.titleColor,
          createdAt: updatedUser.createdAt,
          lastActive: updatedUser.lastActive
        },
        stats: updatedUser.stats ? {
          status: updatedUser.stats.status,
          lastUpdated: updatedUser.stats.lastUpdated
        } : null,
        goreanStats: updatedStats ? {
          id: updatedStats.id,
          // Identity
          characterName: encodeForLSL(updatedStats.characterName),
          agentName: encodeForLSL(updatedStats.agentName),
          title: encodeForLSL(updatedStats.title),

          // Taxonomy
          species: encodeForLSL(updatedStats.species),
          speciesCategory: encodeForLSL(updatedStats.speciesCategory),
          speciesVariant: encodeForLSL(updatedStats.speciesVariant),
          culture: encodeForLSL(updatedStats.culture),
          cultureType: encodeForLSL(updatedStats.cultureType),
          status: encodeForLSL(updatedStats.status),
          statusSubtype: encodeForLSL(updatedStats.statusSubtype),
          casteRole: encodeForLSL(updatedStats.casteRole),
          casteRoleType: encodeForLSL(updatedStats.casteRoleType),
          region: encodeForLSL(updatedStats.region),
          homeStoneName: encodeForLSL(updatedStats.homeStoneName),

          // Base Stats
          strength: updatedStats.strength,
          agility: updatedStats.agility,
          intellect: updatedStats.intellect,
          perception: updatedStats.perception,
          charisma: updatedStats.charisma,
          statPointsPool: updatedStats.statPointsPool,
          statPointsSpent: updatedStats.statPointsSpent,

          // Derived Stats
          healthMax: updatedStats.healthMax,
          hungerMax: updatedStats.hungerMax,
          thirstMax: updatedStats.thirstMax,

          // Current State
          healthCurrent: updatedStats.healthCurrent,
          hungerCurrent: updatedStats.hungerCurrent,
          thirstCurrent: updatedStats.thirstCurrent,

          // Economy (read from UserStats, not GoreanStats)
          goldCoin: updatedUserStats.goldCoin,
          silverCoin: updatedUserStats.silverCoin,
          copperCoin: updatedUserStats.copperCoin,
          xp: updatedStats.xp,

          // Active Effects & Live Stats
          activeEffects: updatedStats.activeEffects,
          liveStats: updatedStats.liveStats,

          // Point allocations
          skillsAllocatedPoints: updatedStats.skillsAllocatedPoints,
          skillsSpentPoints: updatedStats.skillsSpentPoints,

          // Metadata
          registrationCompleted: updatedStats.registrationCompleted,
          gorRole: updatedStats.gorRole,
          createdAt: updatedStats.createdAt
        } : null,
        hasGoreanCharacter: !!updatedStats && updatedStats.registrationCompleted ? "true" : "false"
      }
    });

  } catch (error: unknown) {
    console.error('Error updating Gorean stats:', error);

    // Handle case where Gorean stats don't exist
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Gorean character not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
