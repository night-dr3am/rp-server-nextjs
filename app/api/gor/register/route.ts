import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { goreanRegisterSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const { error, value } = goreanRegisterSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { sl_uuid, universe, timestamp, signature } = value;

    // Validate signature for Gor universe
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find or create user in Gor universe (case-insensitive universe matching)
    let user = await prisma.user.findFirst({
      where: {
        slUuid: sl_uuid,
        universe: {
          equals: universe,
          mode: 'insensitive'
        }
      },
      include: { goreanStats: true }
    });

    // If user doesn't exist, create them with default values
    if (!user) {
      // Create user with basic stats in a transaction
      user = await prisma.user.create({
        data: {
          slUuid: sl_uuid,
          universe: universe,
          username: sl_uuid, // Use UUID as temporary username
          role: 'FREE', // Default role for new Gorean users
          stats: {
            create: {
              health: 5,  // Default health for Strength=1
              hunger: 100,
              thirst: 100
            }
          }
        },
        include: {
          goreanStats: true
        }
      });
    }

    // If user already has completed Gorean character registration, return their stats
    if (user.goreanStats && user.goreanStats.registrationCompleted) {
      return NextResponse.json({
        success: true,
        data: {
          alreadyRegistered: "true",  // String for LSL compatibility
          goreanStats: {
            characterName: user.goreanStats.characterName,
            agentName: user.goreanStats.agentName,
            species: user.goreanStats.species,
            culture: user.goreanStats.culture,
            status: user.goreanStats.status,
            casteRole: user.goreanStats.casteRole,
            strength: user.goreanStats.strength,
            agility: user.goreanStats.agility,
            intellect: user.goreanStats.intellect,
            perception: user.goreanStats.perception,
            charisma: user.goreanStats.charisma,
            healthMax: user.goreanStats.healthMax,
            goldCoin: user.goreanStats.goldCoin,
            silverCoin: user.goreanStats.silverCoin,
            copperCoin: user.goreanStats.copperCoin,
            xp: user.goreanStats.xp,
            createdAt: user.goreanStats.createdAt
          },
          user: {
            username: user.username,
            uuid: user.slUuid,
            universe: user.universe
          }
        }
      });
    }

    // If user has incomplete registration (goreanStats exists but not completed),
    // allow them to continue with character creation by generating a new link

    // Clean up expired tokens for this user BEFORE checking rate limit
    await prisma.profileToken.deleteMany({
      where: {
        userId: user.id,
        expiresAt: {
          lt: new Date()
        }
      }
    });

    // Check rate limiting - max 5 tokens per user per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentTokens = await prisma.profileToken.count({
      where: {
        userId: user.id,
        createdAt: {
          gte: oneHourAgo
        }
      }
    });

    if (recentTokens >= 5) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Please wait before generating a new character creation link.' },
        { status: 429 }
      );
    }

    // Generate JWT token for character creation
    const jwtPayload = {
      sub: user.slUuid,
      universe: user.universe,
      purpose: 'gor_character_creation',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hour expiration
      jti: `gor_${user.id}_${Date.now()}`
    };

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return NextResponse.json(
        { success: false, error: 'JWT secret not configured' },
        { status: 500 }
      );
    }

    const token = jwt.sign(jwtPayload, jwtSecret);

    // Store token in database
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    await prisma.profileToken.create({
      data: {
        userId: user.id,
        token: token,
        expiresAt: expiresAt
      }
    });

    // Generate character creation URL
    const characterCreationUrl = `/gor/create/${user.slUuid}?token=${token}&universe=${encodeURIComponent(user.universe)}`;

    return NextResponse.json({
      success: true,
      data: {
        alreadyRegistered: "false",  // String for LSL compatibility
        characterCreationUrl: characterCreationUrl,
        token: token,
        expiresAt: expiresAt.toISOString(),
        user: {
          username: user.username,
          uuid: user.slUuid,
          universe: user.universe
        }
      }
    });

  } catch (error: unknown) {
    console.error('Error generating Gorean character creation link:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
