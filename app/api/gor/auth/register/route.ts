import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { registerUserSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { encodeForLSL } from '@/lib/stringUtils';

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

    // Ensure universe is gor (case-insensitive)
    const universeStr = universe.toLowerCase();
    if (universeStr !== 'gor') {
      return NextResponse.json(
        { success: false, error: 'This endpoint is only for Gor universe registration' },
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
        goreanStats: true // Include goreanStats in the response (will be null for new users)
      }
    });

    // Return success response with nested structure (matching Arkana pattern)
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          slUuid: user.slUuid,
          username: encodeForLSL(user.username),
          role: user.role,
          universe: user.universe,
          createdAt: user.createdAt
        },
        stats: user.stats ? {
          status: user.stats.status  // Generic RPG status (not social status)
          // health, hunger, thirst, coins: will be in goreanStats after character creation
        } : null,
        goreanStats: null, // Will be null for new registrations until character creation is completed
        hasGoreanCharacter: "false",  // String for LSL compatibility (new users don't have characters yet)
        message: 'User registered successfully in Gor universe'
      }
    }, { status: 201 });

  } catch (error: unknown) {
    console.error('Error registering Gor user:', error);
    
    // Handle Prisma unique constraint violation (user already exists)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'User already registered' },
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
