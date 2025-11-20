import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaShopItemsRequestSchema } from '@/lib/validation';
import { validateProfileTokenForUser, associateTokenWithSession } from '@/lib/profileTokenUtils';
import {
  getAvailableCybernetics,
  getAvailableMagic,
  groupCyberneticsForShop,
} from '@/lib/arkana/shopHelpers';
import { loadAllData } from '@/lib/arkana/dataLoader';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sl_uuid = searchParams.get('sl_uuid');
    const universe = searchParams.get('universe');
    const token = searchParams.get('token');
    const sessionId = searchParams.get('sessionId');

    // Validate input
    const { error, value } = arkanaShopItemsRequestSchema.validate({
      sl_uuid,
      universe,
      token,
      sessionId
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    // Validate token for the specific user with session validation
    const validationResult = await validateProfileTokenForUser(
      value.token,
      value.sl_uuid,
      value.universe,
      value.sessionId
    );

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
      await associateTokenWithSession(
        validationResult.profileToken!.id,
        validationResult.profileToken!.userId,
        value.sessionId
      );
    }

    // Find user with Arkana stats
    const user = await prisma.user.findFirst({
      where: { slUuid: value.sl_uuid, universe: value.universe },
      include: {
        arkanaStats: true
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

    // Load Arkana data (cybernetics and magic)
    await loadAllData();

    // Get character data
    const arkanaStats = user.arkanaStats;
    const race = arkanaStats.race || '';
    const archetype = arkanaStats.archetype || '';
    const currentXp = arkanaStats.xp || 0;

    // Get owned items
    const ownedCyberneticIds = arkanaStats.cyberneticAugments || [];
    const ownedSchoolIds = arkanaStats.magicSchools || [];
    const ownedWeaveIds = arkanaStats.magicWeaves || [];

    // Get available cybernetics
    const availableCybernetics = getAvailableCybernetics(ownedCyberneticIds);
    const groupedCybernetics = groupCyberneticsForShop(availableCybernetics);

    // Get available magic (filtered by race/archetype)
    const availableMagic = getAvailableMagic(
      race,
      archetype,
      ownedSchoolIds,
      ownedWeaveIds
    );

    return NextResponse.json({
      success: true,
      data: {
        cybernetics: groupedCybernetics,
        magicSchools: availableMagic,
        currentXp: currentXp,
        cyberneticsSlots: {
          current: arkanaStats.cyberneticsSlots || 0,
          used: ownedCyberneticIds.length,
          costPerSlot: 1
        },
        characterInfo: {
          race: race,
          archetype: archetype,
          characterName: arkanaStats.characterName || 'Unknown'
        }
      }
    });

  } catch (error: unknown) {
    console.error('Error fetching shop items:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
