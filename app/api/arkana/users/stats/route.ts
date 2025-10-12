import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaStatsSchema, arkanaUpdateStatsSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { sanitizeForLSL, encodeForLSL } from '@/lib/stringUtils';
import { parseActiveEffects, recalculateLiveStats, formatLiveStatsForLSL } from '@/lib/arkana/effectsUtils';

// GET /api/arkana/users/stats - Retrieve Arkana user statistics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sl_uuid = searchParams.get('sl_uuid');
    const universe = searchParams.get('universe');
    const timestamp = searchParams.get('timestamp');
    const signature = searchParams.get('signature');

    // Validate input
    const { error, value } = arkanaStatsSchema.validate({ sl_uuid, universe, timestamp, signature });
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const validatedParams = value;

    // Validate signature for Arkana universe
    const signatureValidation = validateSignature(validatedParams.timestamp, validatedParams.signature, validatedParams.universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find user in Arkana universe with all related data
    const user = await prisma.user.findFirst({
      where: { slUuid: validatedParams.sl_uuid, universe: validatedParams.universe },
      include: {
        stats: true,
        arkanaStats: true
      }
    });

    // Update last active timestamp
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastActive: new Date() }
      });
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found in Arkana universe' },
        { status: 404 }
      );
    }

    // Calculate liveStats string for HUD display
    let liveStatsString = '';
    if (user.arkanaStats) {
      const activeEffects = parseActiveEffects(user.arkanaStats.activeEffects);
      const liveStats = recalculateLiveStats(user.arkanaStats, activeEffects);
      liveStatsString = formatLiveStatsForLSL(liveStats);
    }

    // Return user stats including Arkana character data
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          slUuid: user.slUuid,
          username: user.username,
          role: user.role,
          universe: user.universe,
          title: encodeForLSL(user.title),
          titleColor: user.titleColor,
          createdAt: user.createdAt,
          lastActive: user.lastActive
        },
        stats: user.stats ? {
          status: user.stats.status,
          health: user.stats.health,
          hunger: user.stats.hunger,
          thirst: user.stats.thirst,
          goldCoin: user.stats.goldCoin,
          silverCoin: user.stats.silverCoin,
          copperCoin: user.stats.copperCoin,
          lastUpdated: user.stats.lastUpdated
        } : null,
        arkanaStats: user.arkanaStats ? {
          id: user.arkanaStats.id,
          characterName: encodeForLSL(user.arkanaStats.characterName),
          agentName: encodeForLSL(user.arkanaStats.agentName),
          aliasCallsign: encodeForLSL(user.arkanaStats.aliasCallsign),
          faction: encodeForLSL(user.arkanaStats.faction),
          conceptRole: encodeForLSL(user.arkanaStats.conceptRole),
          job: encodeForLSL(user.arkanaStats.job),
          background: encodeForLSL(sanitizeForLSL(user.arkanaStats.background, 50)),
          race: encodeForLSL(user.arkanaStats.race),
          subrace: encodeForLSL(user.arkanaStats.subrace),
          archetype: encodeForLSL(user.arkanaStats.archetype),
          physical: user.arkanaStats.physical,
          dexterity: user.arkanaStats.dexterity,
          mental: user.arkanaStats.mental,
          perception: user.arkanaStats.perception,
          hitPoints: user.arkanaStats.hitPoints,
          statPointsPool: user.arkanaStats.statPointsPool,
          statPointsSpent: user.arkanaStats.statPointsSpent,
          inherentPowers: user.arkanaStats.inherentPowers,
          weaknesses: user.arkanaStats.weaknesses,
          flaws: user.arkanaStats.flaws,
          flawPointsGranted: user.arkanaStats.flawPointsGranted,
          powerPointsBudget: user.arkanaStats.powerPointsBudget,
          powerPointsBonus: user.arkanaStats.powerPointsBonus,
          powerPointsSpent: user.arkanaStats.powerPointsSpent,
          commonPowers: user.arkanaStats.commonPowers,
          archetypePowers: user.arkanaStats.archetypePowers,
          perks: user.arkanaStats.perks,
          magicSchools: user.arkanaStats.magicSchools,
          magicWeaves: user.arkanaStats.magicWeaves,
          cybernetics: user.arkanaStats.cybernetics,
          cyberneticAugments: user.arkanaStats.cyberneticAugments,
          credits: user.arkanaStats.credits,
          chips: user.arkanaStats.chips,
          xp: user.arkanaStats.xp,
          liveStatsString: liveStatsString,
          createdAt: user.arkanaStats.createdAt,
          updatedAt: user.arkanaStats.updatedAt
        } : null,
        hasArkanaCharacter: !!user.arkanaStats ? "true" : "false"  // String for LSL compatibility
      }
    });

  } catch (error: unknown) {
    console.error('Error fetching Arkana user stats:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/arkana/users/stats - Update Arkana user statistics
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input using our validation schema
    const { error, value } = arkanaUpdateStatsSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { sl_uuid, universe, status: userStatus, health, hunger, thirst, timestamp, signature } = value;

    // Validate signature for Arkana universe
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Prepare update data, only including fields if they're provided
    const updateData: {
      status?: number;
      health?: number;
      hunger?: number;
      thirst?: number;
      lastUpdated: Date;
    } = {
      lastUpdated: new Date()
    };

    // Only update fields if they're provided in the request
    // Clamp stats values to valid ranges
    if (userStatus !== undefined) updateData.status = Math.max(0, Math.min(2, userStatus)); // Arkana: 0=RP, 1=OOC, 2=AFK
    if (health !== undefined) updateData.health = Math.max(0, Math.min(100, health));
    if (hunger !== undefined) updateData.hunger = Math.max(0, Math.min(100, hunger));
    if (thirst !== undefined) updateData.thirst = Math.max(0, Math.min(100, thirst));

    // Update user stats using a nested upsert through user relation
    const updatedUser = await prisma.user.update({
      where: {
        slUuid_universe: {
          slUuid: sl_uuid,
          universe: universe
        }
      },
      data: {
        lastActive: new Date(),
        stats: {
          upsert: {
            create: {
              ...updateData,
              health: updateData.health ?? 100,
              hunger: updateData.hunger ?? 100,
              thirst: updateData.thirst ?? 100,
              status: updateData.status ?? 0,
            },
            update: updateData
          }
        }
      },
      include: {
        stats: true,
        arkanaStats: true
      }
    });

    // Calculate liveStats string for HUD display
    let liveStatsString = '';
    if (updatedUser.arkanaStats) {
      const activeEffects = parseActiveEffects(updatedUser.arkanaStats.activeEffects);
      const liveStats = recalculateLiveStats(updatedUser.arkanaStats, activeEffects);
      liveStatsString = formatLiveStatsForLSL(liveStats);
    }

    // Return the updated stats in the same format as GET
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: updatedUser.id,
          slUuid: updatedUser.slUuid,
          username: updatedUser.username,
          role: updatedUser.role,
          universe: updatedUser.universe,
          title: encodeForLSL(updatedUser.title),
          titleColor: updatedUser.titleColor,
          createdAt: updatedUser.createdAt,
          lastActive: updatedUser.lastActive
        },
        stats: updatedUser.stats ? {
          status: updatedUser.stats.status,
          health: updatedUser.stats.health,
          hunger: updatedUser.stats.hunger,
          thirst: updatedUser.stats.thirst,
          goldCoin: updatedUser.stats.goldCoin,
          silverCoin: updatedUser.stats.silverCoin,
          copperCoin: updatedUser.stats.copperCoin,
          lastUpdated: updatedUser.stats.lastUpdated
        } : null,
        arkanaStats: updatedUser.arkanaStats ? {
          id: updatedUser.arkanaStats.id,
          characterName: encodeForLSL(updatedUser.arkanaStats.characterName),
          agentName: encodeForLSL(updatedUser.arkanaStats.agentName),
          aliasCallsign: encodeForLSL(updatedUser.arkanaStats.aliasCallsign),
          faction: encodeForLSL(updatedUser.arkanaStats.faction),
          conceptRole: encodeForLSL(updatedUser.arkanaStats.conceptRole),
          job: encodeForLSL(updatedUser.arkanaStats.job),
          background: encodeForLSL(sanitizeForLSL(updatedUser.arkanaStats.background, 50)),
          race: encodeForLSL(updatedUser.arkanaStats.race),
          subrace: encodeForLSL(updatedUser.arkanaStats.subrace),
          archetype: encodeForLSL(updatedUser.arkanaStats.archetype),
          physical: updatedUser.arkanaStats.physical,
          dexterity: updatedUser.arkanaStats.dexterity,
          mental: updatedUser.arkanaStats.mental,
          perception: updatedUser.arkanaStats.perception,
          hitPoints: updatedUser.arkanaStats.hitPoints,
          statPointsPool: updatedUser.arkanaStats.statPointsPool,
          statPointsSpent: updatedUser.arkanaStats.statPointsSpent,
          inherentPowers: updatedUser.arkanaStats.inherentPowers,
          weaknesses: updatedUser.arkanaStats.weaknesses,
          flaws: updatedUser.arkanaStats.flaws,
          flawPointsGranted: updatedUser.arkanaStats.flawPointsGranted,
          powerPointsBudget: updatedUser.arkanaStats.powerPointsBudget,
          powerPointsBonus: updatedUser.arkanaStats.powerPointsBonus,
          powerPointsSpent: updatedUser.arkanaStats.powerPointsSpent,
          commonPowers: updatedUser.arkanaStats.commonPowers,
          archetypePowers: updatedUser.arkanaStats.archetypePowers,
          perks: updatedUser.arkanaStats.perks,
          magicSchools: updatedUser.arkanaStats.magicSchools,
          magicWeaves: updatedUser.arkanaStats.magicWeaves,
          cybernetics: updatedUser.arkanaStats.cybernetics,
          cyberneticAugments: updatedUser.arkanaStats.cyberneticAugments,
          credits: updatedUser.arkanaStats.credits,
          chips: updatedUser.arkanaStats.chips,
          xp: updatedUser.arkanaStats.xp,
          liveStatsString: liveStatsString,
          createdAt: updatedUser.arkanaStats.createdAt,
          updatedAt: updatedUser.arkanaStats.updatedAt
        } : null,
        hasArkanaCharacter: !!updatedUser.arkanaStats ? "true" : "false"  // String for LSL compatibility
      }
    });

  } catch (error: unknown) {
    console.error('Error updating Arkana user stats:', error);

    // Handle case where user doesn't exist
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'User not found in Arkana universe' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}