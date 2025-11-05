import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaRegisterSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const { error, value } = arkanaRegisterSchema.validate(body);
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

    // Find or create user in Arkana universe
    let user = await prisma.user.findFirst({
      where: { slUuid: sl_uuid, universe: universe },
      include: { arkanaStats: true }
    });

    // If user doesn't exist, create them with default values
    if (!user) {
      // Create user with basic stats in a transaction
      user = await prisma.user.create({
        data: {
          slUuid: sl_uuid,
          universe: universe,
          username: sl_uuid, // Use UUID as temporary username
          role: 'FREE', // Default role for new Arkana users
          stats: {
            create: {
              health: 100,
              hunger: 100,
              thirst: 100
            }
          }
        },
        include: {
          arkanaStats: true
        }
      });
    }

    // If user already has completed Arkana character registration, return their stats
    if (user.arkanaStats && user.arkanaStats.registrationCompleted) {
      return NextResponse.json({
        success: true,
        data: {
          alreadyRegistered: "true",  // String for LSL compatibility
          arkanaStats: {
            characterName: user.arkanaStats.characterName,
            race: user.arkanaStats.race,
            archetype: user.arkanaStats.archetype,
            physical: user.arkanaStats.physical,
            dexterity: user.arkanaStats.dexterity,
            mental: user.arkanaStats.mental,
            perception: user.arkanaStats.perception,
            maxHP: user.arkanaStats.maxHP,
            hitPoints: user.arkanaStats.maxHP, // DEPRECATED: Use maxHP (kept for backward compatibility)
            credits: user.arkanaStats.credits,
            chips: user.arkanaStats.chips,
            xp: user.arkanaStats.xp,
            createdAt: user.arkanaStats.createdAt
          },
          user: {
            username: user.username,
            uuid: user.slUuid,
            universe: user.universe
          }
        }
      });
    }

    // If user has incomplete registration (arkanaStats exists but not completed),
    // allow them to continue with character creation by generating a new link

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

    // Clean up expired tokens for this user
    await prisma.profileToken.deleteMany({
      where: {
        userId: user.id,
        expiresAt: {
          lt: new Date()
        }
      }
    });

    // Generate JWT token for character creation
    const jwtPayload = {
      sub: user.slUuid,
      universe: user.universe,
      purpose: 'arkana_character_creation',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hour expiration
      jti: `arkana_${user.id}_${Date.now()}`
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
    const characterCreationUrl = `/arkana/create/${user.slUuid}?token=${token}&universe=${encodeURIComponent(user.universe)}`;

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
    console.error('Error generating Arkana character creation link:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}