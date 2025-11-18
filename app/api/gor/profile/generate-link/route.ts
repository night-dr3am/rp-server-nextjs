import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateProfileLinkSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const { error, value } = generateProfileLinkSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { sl_uuid, universe, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find user with case-insensitive universe match
    const user = await prisma.user.findFirst({
      where: {
        slUuid: sl_uuid,
        universe: {
          equals: universe,
          mode: 'insensitive'
        }
      }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

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

    if (recentTokens >= 10) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Please wait before generating a new profile link.' },
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

    // Generate JWT token
    const jwtPayload = {
      sub: user.slUuid,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour expiration
      jti: `profile_${user.id}_${Date.now()}`
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
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    await prisma.profileToken.create({
      data: {
        userId: user.id,
        token: token,
        expiresAt: expiresAt
      }
    });

    // Generate profile URL based on universe (Gor-specific route)
    const profilePath = user.universe === 'arkana' ? '/arkana/profile' : '/gor/profile';
    const profileUrl = `${profilePath}/${user.slUuid}?token=${token}&universe=${encodeURIComponent(user.universe)}`;

    return NextResponse.json({
      success: true,
      data: {
        profileUrl: profileUrl,
        token: token,
        expiresAt: expiresAt.toISOString(),
        user: {
          username: user.username,
          uuid: user.slUuid
        }
      }
    });

  } catch (error: unknown) {
    console.error('Error generating profile link:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}