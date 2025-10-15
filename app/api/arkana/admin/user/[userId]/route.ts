import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaAdminVerifySchema, arkanaAdminUserUpdateSchema } from '@/lib/validation';
import { validateAdminToken, validateHealthValues } from '@/lib/arkana/adminUtils';
import { getAllFlaws, loadAllData } from '@/lib/arkana/dataLoader';

interface RouteContext {
  params: Promise<{ userId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const userId = params.userId;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    // Validate token
    const { error } = arkanaAdminVerifySchema.validate({ token });
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    // Validate admin token
    const adminValidation = await validateAdminToken(token!);
    if (!adminValidation.valid) {
      return NextResponse.json(
        { success: false, error: adminValidation.error || 'Access denied' },
        { status: 403 }
      );
    }

    // Fetch user with full Arkana stats
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        stats: true,
        arkanaStats: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    if (!user.arkanaStats) {
      return NextResponse.json(
        { success: false, error: 'Arkana character not found for this user' },
        { status: 404 }
      );
    }

    // DEV: Log what we're sending from database
    if (process.env.NODE_ENV === 'development') {
      console.log('[SERVER GET] Flaws from database:', user.arkanaStats.flaws);
    }

    // Return full user data
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          slUuid: user.slUuid,
          username: user.username,
          role: user.role,
          universe: user.universe,
          createdAt: user.createdAt,
          lastActive: user.lastActive
        },
        stats: user.stats ? {
          health: user.stats.health,
          status: user.stats.status,
          hunger: user.stats.hunger,
          thirst: user.stats.thirst,
          goldCoin: user.stats.goldCoin,
          silverCoin: user.stats.silverCoin,
          copperCoin: user.stats.copperCoin,
          lastUpdated: user.stats.lastUpdated
        } : null,
        arkanaStats: user.arkanaStats
      }
    });

  } catch (error: unknown) {
    console.error('Error fetching user data:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    // Load Arkana data if not already loaded
    await loadAllData();

    const params = await context.params;
    const userId = params.userId;
    const body = await request.json();

    // Validate input
    const { error, value } = arkanaAdminUserUpdateSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    // Validate admin token
    const adminValidation = await validateAdminToken(value.token);
    if (!adminValidation.valid) {
      return NextResponse.json(
        { success: false, error: adminValidation.error || 'Access denied' },
        { status: 403 }
      );
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        arkanaStats: true,
        stats: true
      }
    });

    if (!existingUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    if (!existingUser.arkanaStats) {
      return NextResponse.json(
        { success: false, error: 'Arkana character not found for this user' },
        { status: 404 }
      );
    }

    // Validate health values if provided
    if (value.health !== undefined || value.hitPoints !== undefined) {
      const currentHealth = value.health !== undefined ? value.health : (existingUser.stats?.health || 0);
      const maxHealth = value.hitPoints !== undefined ? value.hitPoints : existingUser.arkanaStats.hitPoints;

      const healthValidation = validateHealthValues(currentHealth, maxHealth);
      if (!healthValidation.valid) {
        return NextResponse.json(
          { success: false, error: healthValidation.error },
          { status: 400 }
        );
      }
    }

    // DEV: Log what we received
    if (process.env.NODE_ENV === 'development') {
      console.log('[SERVER PUT] Received flaws:', value.flaws);
    }

    // Convert flaws array to JSON format if provided
    let flawsJson = null;
    if (value.flaws !== undefined && Array.isArray(value.flaws)) {
      const allFlaws = getAllFlaws();
      if (process.env.NODE_ENV === 'development') {
        console.log('[SERVER PUT] All flaws loaded:', allFlaws.length);
      }
      flawsJson = value.flaws.map((flawId: string) => {
        const flaw = allFlaws.find(f => f.id === flawId);
        if (process.env.NODE_ENV === 'development') {
          if (flaw) {
            console.log(`[SERVER PUT] Matched ID "${flawId}" -> {id: "${flaw.id}", name: "${flaw.name}", cost: ${flaw.cost}}`);
          } else {
            console.warn(`[SERVER PUT] Could not find flaw with ID: "${flawId}"`);
          }
        }
        return flaw ? { id: flaw.id, name: flaw.name, cost: flaw.cost } : null;
      }).filter(Boolean);

      if (process.env.NODE_ENV === 'development') {
        console.log('[SERVER PUT] Final flaws JSON to save:', flawsJson);
      }
    }

    // Build update data for arkanaStats
    const arkanaStatsUpdate: Record<string, unknown> = {};
    const arkanaFields = [
      'characterName', 'agentName', 'aliasCallsign', 'faction', 'conceptRole', 'job', 'background',
      'race', 'subrace', 'archetype',
      'physical', 'dexterity', 'mental', 'perception', 'hitPoints',
      'inherentPowers', 'weaknesses',
      'commonPowers', 'archetypePowers', 'perks',
      'magicSchools', 'magicWeaves',
      'cybernetics', 'cyberneticAugments',
      'skills', 'skillsAllocatedPoints', 'skillsSpentPoints',
      'credits', 'chips', 'xp',
      'arkanaRole'
    ];

    for (const field of arkanaFields) {
      if (value[field] !== undefined) {
        arkanaStatsUpdate[field] = value[field];
      }
    }

    // Add converted flaws if provided
    if (value.flaws !== undefined) {
      arkanaStatsUpdate.flaws = flawsJson;
    }

    // Build update data for userStats
    const userStatsUpdate: Record<string, unknown> = {};
    if (value.health !== undefined) {
      userStatsUpdate.health = value.health;
    }
    if (value.status !== undefined) {
      userStatsUpdate.status = value.status;
    }

    // Update both models in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update arkanaStats
      const updatedArkanaStats = await tx.arkanaStats.update({
        where: { userId: userId },
        data: {
          ...arkanaStatsUpdate,
          updatedAt: new Date()
        }
      });

      // Update userStats if there are changes
      let updatedUserStats = existingUser.stats;
      if (Object.keys(userStatsUpdate).length > 0) {
        if (existingUser.stats) {
          updatedUserStats = await tx.userStats.update({
            where: { userId: userId },
            data: {
              ...userStatsUpdate,
              lastUpdated: new Date()
            }
          });
        } else {
          // Create userStats if it doesn't exist
          updatedUserStats = await tx.userStats.create({
            data: {
              userId: userId,
              health: value.health !== undefined ? value.health : updatedArkanaStats.hitPoints,
              status: value.status !== undefined ? value.status : 0,
              hunger: 100,
              thirst: 100,
              goldCoin: 0,
              silverCoin: 0,
              copperCoin: 10,
              lastUpdated: new Date()
            }
          });
        }
      }

      // Update user's last active
      await tx.user.update({
        where: { id: userId },
        data: { lastActive: new Date() }
      });

      return { updatedArkanaStats, updatedUserStats };
    });

    return NextResponse.json({
      success: true,
      data: {
        message: 'User data updated successfully',
        arkanaStats: result.updatedArkanaStats,
        stats: result.updatedUserStats
      }
    });

  } catch (error: unknown) {
    console.error('Error updating user data:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
