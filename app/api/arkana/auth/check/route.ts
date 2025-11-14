import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkUserSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { sanitizeForLSL, encodeForLSL } from '@/lib/stringUtils';
import { parseActiveEffects, recalculateLiveStats, formatLiveStatsForLSL, buildArkanaStatsUpdate } from '@/lib/arkana/effectsUtils';
import { loadAllData } from '@/lib/arkana/dataLoader';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sl_uuid = searchParams.get('sl_uuid');
    const universe = searchParams.get('universe');
    const timestamp = searchParams.get('timestamp');
    const signature = searchParams.get('signature');

    // Validate input using signature schema
    const { error } = checkUserSchema.validate({ sl_uuid, universe, timestamp, signature });
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    // Ensure universe is arkana
    if (universe !== 'arkana') {
      return NextResponse.json(
        { success: false, error: 'This endpoint is only for Arkana universe' },
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

    // Find user and include their stats and arkana stats
    const user = await prisma.user.findFirst({
      where: {
        slUuid: sl_uuid!,
        universe: {
          equals: universe!,
          mode: 'insensitive'
        }
      },
      include: {
        stats: true,
        arkanaStats: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found in Arkana universe' },
        { status: 404 }
      );
    }

    // Check if user has completed Arkana character registration
    if (!user.arkanaStats || !user.arkanaStats.registrationCompleted) {
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

    // Calculate liveStats string for HUD display
    let liveStatsString = '';
    if (user.arkanaStats) {
      // Load effect definitions needed for recalculation
      await loadAllData();
      const activeEffects = parseActiveEffects(user.arkanaStats.activeEffects);
      const liveStats = recalculateLiveStats(user.arkanaStats, activeEffects);

      // Persist recalculated liveStats to database
      await prisma.arkanaStats.update({
        where: { userId: user.id },
        data: buildArkanaStatsUpdate({
          activeEffects,
          liveStats
        })
      });

      liveStatsString = formatLiveStatsForLSL(liveStats, activeEffects);
    }

    // Return user data with nested structure (consistent with GET_STATS endpoint)
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
          maxHP: user.arkanaStats.maxHP,
          hitPoints: user.arkanaStats.maxHP, // DEPRECATED: Use maxHP (kept for LSL backward compatibility)
          credits: user.arkanaStats.credits,
          chips: user.arkanaStats.chips,
          xp: user.arkanaStats.xp,
          liveStatsString: liveStatsString,
          createdAt: user.arkanaStats.createdAt
        } : null,
        hasArkanaCharacter: !!user.arkanaStats ? "true" : "false"  // String for LSL compatibility
      }
    });

  } catch (error: unknown) {
    console.error('Error checking Arkana user:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input using our validation schema
    const { error, value } = checkUserSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { sl_uuid, universe, timestamp, signature } = value;

    // Ensure universe is arkana
    if (universe !== 'arkana') {
      return NextResponse.json(
        { success: false, error: 'This endpoint is only for Arkana universe' },
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

    // Find user and include their stats and arkana stats
    const user = await prisma.user.findFirst({
      where: {
        slUuid: sl_uuid,
        universe: {
          equals: universe,
          mode: 'insensitive'
        }
      },
      include: {
        stats: true,
        arkanaStats: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found in Arkana universe' },
        { status: 404 }
      );
    }

    // Check if user has completed Arkana character registration
    if (!user.arkanaStats || !user.arkanaStats.registrationCompleted) {
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

    // Calculate liveStats string for HUD display
    let liveStatsString = '';
    if (user.arkanaStats) {
      // Load effect definitions needed for recalculation
      await loadAllData();
      const activeEffects = parseActiveEffects(user.arkanaStats.activeEffects);
      const liveStats = recalculateLiveStats(user.arkanaStats, activeEffects);

      // Persist recalculated liveStats to database
      await prisma.arkanaStats.update({
        where: { userId: user.id },
        data: buildArkanaStatsUpdate({
          activeEffects,
          liveStats
        })
      });

      liveStatsString = formatLiveStatsForLSL(liveStats, activeEffects);
    }

    // Return user data with nested structure (consistent with GET_STATS endpoint)
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
          maxHP: user.arkanaStats.maxHP,
          hitPoints: user.arkanaStats.maxHP, // DEPRECATED: Use maxHP (kept for LSL backward compatibility)
          credits: user.arkanaStats.credits,
          chips: user.arkanaStats.chips,
          xp: user.arkanaStats.xp,
          liveStatsString: liveStatsString
        } : null,
        hasArkanaCharacter: !!user.arkanaStats ? "true" : "false"  // String for LSL compatibility
      }
    });

  } catch (error: unknown) {
    console.error('Error checking Arkana user:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}