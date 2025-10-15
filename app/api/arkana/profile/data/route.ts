import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaProfileDataSchema } from '@/lib/validation';
import { validateProfileTokenForUser, associateTokenWithSession } from '@/lib/profileTokenUtils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sl_uuid = searchParams.get('sl_uuid');
    const universe = searchParams.get('universe');
    const token = searchParams.get('token');
    const sessionId = searchParams.get('sessionId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Validate input
    const { error, value } = arkanaProfileDataSchema.validate({ sl_uuid, universe, token, page, limit });
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    // Validate session ID is provided
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // Validate token for the specific user with session validation
    const validationResult = await validateProfileTokenForUser(value.token, value.sl_uuid, value.universe, sessionId);

    if (!validationResult.valid) {
      let status = 401;
      let userFriendlyError = validationResult.error;

      // Provide user-friendly error messages
      if (validationResult.error === 'Token expired') {
        userFriendlyError = 'This profile link has expired. Please request a new link from your HUD.';
      } else if (validationResult.error === 'Token does not match requested user') {
        status = 403;
        userFriendlyError = 'This profile link is not valid for the requested user.';
      } else if (validationResult.error === 'Token belongs to a different session') {
        status = 403;
        userFriendlyError = 'This profile link is being used in a different browser session.';
      }

      return NextResponse.json(
        { success: false, error: userFriendlyError },
        { status }
      );
    }

    // Associate token with session if this is the first access
    if (!validationResult.profileToken!.sessionId) {
      await associateTokenWithSession(validationResult.profileToken!.id, validationResult.profileToken!.userId, sessionId);
    }

    // Find user with all related data
    const user = await prisma.user.findFirst({
      where: { slUuid: value.sl_uuid, universe: value.universe },
      include: {
        stats: true,
        arkanaStats: true,
        inventories: {
          include: {
            item: true
          },
          take: 10 // Limit inventory items shown
        }
      }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user has Arkana character
    if (!user.arkanaStats) {
      return NextResponse.json(
        { success: false, error: 'Arkana character not found. Please complete character creation first.' },
        { status: 404 }
      );
    }

    // Get paginated events
    const skip = (value.page - 1) * value.limit;
    const [events, totalEvents] = await Promise.all([
      prisma.event.findMany({
        where: { userId: user.id },
        orderBy: { timestamp: 'desc' },
        skip: skip,
        take: value.limit
      }),
      prisma.event.count({
        where: { userId: user.id }
      })
    ]);

    // Calculate inventory summary
    const inventorySummary = user.inventories.reduce((acc, inv) => {
      acc.totalItems += inv.quantity;
      // Convert all to copper for total value (assuming 1g=10000c, 1s=100c for Arkana too)
      acc.totalValue += (inv.priceGold * 10000) + (inv.priceSilver * 100) + inv.priceCopper;
      return acc;
    }, { totalItems: 0, totalValue: 0 });

    const totalPages = Math.ceil(totalEvents / value.limit);

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          slUuid: user.slUuid,
          username: user.username,
          role: user.role,
          createdAt: user.createdAt,
          lastActive: user.lastActive
        },
        stats: user.stats ? {
          status: user.stats.status,
          health: user.stats.health, // Current health
          hunger: user.stats.hunger,
          thirst: user.stats.thirst,
          goldCoin: user.stats.goldCoin,
          silverCoin: user.stats.silverCoin,
          copperCoin: user.stats.copperCoin,
          lastUpdated: user.stats.lastUpdated
        } : null,
        arkanaStats: {
          characterName: user.arkanaStats.characterName,
          agentName: user.arkanaStats.agentName,
          aliasCallsign: user.arkanaStats.aliasCallsign,
          faction: user.arkanaStats.faction,
          conceptRole: user.arkanaStats.conceptRole,
          job: user.arkanaStats.job,
          background: user.arkanaStats.background,
          race: user.arkanaStats.race,
          subrace: user.arkanaStats.subrace,
          archetype: user.arkanaStats.archetype,
          physical: user.arkanaStats.physical,
          dexterity: user.arkanaStats.dexterity,
          mental: user.arkanaStats.mental,
          perception: user.arkanaStats.perception,
          hitPoints: user.arkanaStats.hitPoints, // Maximum health
          inherentPowers: user.arkanaStats.inherentPowers,
          weaknesses: user.arkanaStats.weaknesses,
          flaws: user.arkanaStats.flaws,
          commonPowers: user.arkanaStats.commonPowers,
          archetypePowers: user.arkanaStats.archetypePowers,
          perks: user.arkanaStats.perks,
          magicSchools: user.arkanaStats.magicSchools,
          magicWeaves: user.arkanaStats.magicWeaves,
          cybernetics: user.arkanaStats.cybernetics,
          cyberneticAugments: user.arkanaStats.cyberneticAugments,
          skills: user.arkanaStats.skills,
          skillsAllocatedPoints: user.arkanaStats.skillsAllocatedPoints,
          skillsSpentPoints: user.arkanaStats.skillsSpentPoints,
          credits: user.arkanaStats.credits,
          chips: user.arkanaStats.chips,
          xp: user.arkanaStats.xp,
          arkanaRole: user.arkanaStats.arkanaRole, // Include admin role
          registrationCompleted: user.arkanaStats.registrationCompleted,
          createdAt: user.arkanaStats.createdAt,
          updatedAt: user.arkanaStats.updatedAt
        },
        inventory: {
          summary: inventorySummary,
          items: user.inventories.map(inv => ({
            name: inv.item.name,
            shortName: inv.item.shortName,
            quantity: inv.quantity,
            category: inv.item.category,
            priceGold: inv.priceGold,
            priceSilver: inv.priceSilver,
            priceCopper: inv.priceCopper
          }))
        },
        events: {
          data: events.map(event => ({
            id: event.id,
            type: event.type,
            details: event.details,
            timestamp: event.timestamp
          })),
          pagination: {
            currentPage: value.page,
            totalPages: totalPages,
            totalEvents: totalEvents,
            hasNextPage: value.page < totalPages,
            hasPrevPage: value.page > 1
          }
        }
      }
    });

  } catch (error: unknown) {
    console.error('Error fetching Arkana profile data:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
