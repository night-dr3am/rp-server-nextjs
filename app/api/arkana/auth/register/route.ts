import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { registerUserSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input using our validation schema
    const { error, value } = registerUserSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { sl_uuid, universe, username, role, timestamp, signature } = value;

    // Ensure universe is arkana
    if (universe !== 'arkana') {
      return NextResponse.json(
        { success: false, error: 'This endpoint is only for Arkana universe registration' },
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

    // Create user with initial stats in a single transaction
    // This ensures both user and stats are created together
    const user = await prisma.user.create({
      data: {
        slUuid: sl_uuid,
        universe,
        username,
        role: role.toUpperCase(), // Convert to uppercase to match enum
        stats: {
          create: {
            health: 100,
            hunger: 100,
            thirst: 100
          }
        }
      },
      include: {
        stats: true,
        arkanaStats: true // Include arkanaStats in the response
      }
    });

    // Return success response with user data
    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        sl_uuid: user.slUuid,
        universe: user.universe,
        role: user.role,
        health: user.stats?.health,
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
          background: user.arkanaStats.background,
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
        } : null,
        created_at: user.createdAt,
        message: 'User registered successfully in Arkana universe'
      }
    }, { status: 201 });

  } catch (error: unknown) {
    console.error('Error registering Arkana user:', error);

    // Handle Prisma unique constraint violation (user already exists)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'User already registered in Arkana universe' },
        { status: 409 }
      );
    }

    // Handle other database errors
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}