import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaStatsSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const { error, value } = arkanaStatsSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { sl_uuid, universe, timestamp, signature } = value;

    // Validate signature for Arkana universe
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find user in Arkana universe with all related data
    const user = await prisma.user.findFirst({
      where: { slUuid: sl_uuid, universe: universe },
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
          title: user.title,
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
          createdAt: user.arkanaStats.createdAt,
          updatedAt: user.arkanaStats.updatedAt
        } : null,
        hasArkanaCharacter: !!user.arkanaStats
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