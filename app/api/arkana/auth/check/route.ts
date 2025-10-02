import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkUserSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { sanitizeForLSL } from '@/lib/stringUtils';

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
        universe: universe!
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

    // Return user data with consistent Arkana stats format (same as register endpoint)
    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        sl_uuid: user.slUuid,
        universe: user.universe,
        role: user.role,
        title: user.title,
        titleColor: user.titleColor,
        status: user.stats?.status || 0,
        health: user.stats?.health || 100,
        created_at: user.createdAt,
        last_active: user.lastActive,
        hasArkanaCharacter: !!user.arkanaStats,
        // Include arkanaStats object for LSL parsing
        arkanaStats: user.arkanaStats ? {
          id: user.arkanaStats.id,
          characterName: user.arkanaStats.characterName,
          agentName: user.arkanaStats.agentName,
          aliasCallsign: user.arkanaStats.aliasCallsign,
          faction: user.arkanaStats.faction,
          conceptRole: user.arkanaStats.conceptRole,
          job: user.arkanaStats.job,
          background: sanitizeForLSL(user.arkanaStats.background, 50),
          race: user.arkanaStats.race,
          subrace: user.arkanaStats.subrace,
          archetype: user.arkanaStats.archetype,
          physical: user.arkanaStats.physical,
          dexterity: user.arkanaStats.dexterity,
          mental: user.arkanaStats.mental,
          perception: user.arkanaStats.perception,
          hitPoints: user.arkanaStats.hitPoints,
          credits: user.arkanaStats.credits,
          chips: user.arkanaStats.chips,
          xp: user.arkanaStats.xp,
          createdAt: user.arkanaStats.createdAt
        } : null
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
        universe: universe
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

    // Return user data with consistent Arkana stats format (same as register endpoint)
    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        sl_uuid: user.slUuid,
        universe: user.universe,
        role: user.role,
        title: user.title,
        titleColor: user.titleColor,
        status: user.stats?.status || 0,
        health: user.stats?.health || 100,
        created_at: user.createdAt,
        last_active: user.lastActive,
        hasArkanaCharacter: !!user.arkanaStats,
        // Include arkanaStats object for LSL parsing
        arkanaStats: user.arkanaStats ? {
          id: user.arkanaStats.id,
          characterName: user.arkanaStats.characterName,
          agentName: user.arkanaStats.agentName,
          aliasCallsign: user.arkanaStats.aliasCallsign,
          faction: user.arkanaStats.faction,
          conceptRole: user.arkanaStats.conceptRole,
          job: user.arkanaStats.job,
          background: sanitizeForLSL(user.arkanaStats.background, 50),
          race: user.arkanaStats.race,
          subrace: user.arkanaStats.subrace,
          archetype: user.arkanaStats.archetype,
          physical: user.arkanaStats.physical,
          dexterity: user.arkanaStats.dexterity,
          mental: user.arkanaStats.mental,
          perception: user.arkanaStats.perception,
          hitPoints: user.arkanaStats.hitPoints,
          credits: user.arkanaStats.credits,
          chips: user.arkanaStats.chips,
          xp: user.arkanaStats.xp,
          createdAt: user.arkanaStats.createdAt
        } : null
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