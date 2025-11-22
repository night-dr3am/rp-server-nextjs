import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

export interface ProfileTokenValidationResult {
  valid: boolean;
  profileToken?: {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    sessionId: string | null;
    user: {
      id: string;
      slUuid: string;
      username: string;
      role: string;
      universe: string;
      createdAt: Date;
      lastActive: Date;
    };
  };
  error?: string;
}

/**
 * Validates a profile token without marking it as used
 * Checks JWT signature, database existence, expiry, and usage status
 */
export async function validateProfileToken(token: string): Promise<ProfileTokenValidationResult> {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return { valid: false, error: 'JWT secret not configured' };
    }

    // Verify JWT token signature and expiry
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
    } catch {
      return { valid: false, error: 'Invalid or expired token' };
    }

    // Check token exists in database
    const profileToken = await prisma.profileToken.findUnique({
      where: { token },
      include: { user: true }
    });

    if (!profileToken) {
      return { valid: false, error: 'Token not found' };
    }

    // Check if token has expired (database-level expiry)
    if (profileToken.expiresAt < new Date()) {
      return { valid: false, error: 'Token expired' };
    }

    // Verify the token subject matches the user UUID
    if (decoded.sub !== profileToken.user.slUuid) {
      return { valid: false, error: 'Token does not match user' };
    }

    return {
      valid: true,
      profileToken: {
        id: profileToken.id,
        userId: profileToken.userId,
        token: profileToken.token,
        expiresAt: profileToken.expiresAt,
        sessionId: profileToken.sessionId,
        user: {
          id: profileToken.user.id,
          slUuid: profileToken.user.slUuid,
          username: profileToken.user.username,
          role: profileToken.user.role,
          universe: profileToken.user.universe,
          createdAt: profileToken.user.createdAt,
          lastActive: profileToken.user.lastActive
        }
      }
    };

  } catch (error) {
    console.error('Error validating profile token:', error);
    return { valid: false, error: 'Internal validation error' };
  }
}

/**
 * Associates a profile token with a session ID
 * Also updates the user's last active timestamp
 */
export async function associateTokenWithSession(tokenId: string, userId: string, sessionId: string): Promise<void> {
  await prisma.$transaction([
    // Associate token with session
    prisma.profileToken.update({
      where: { id: tokenId },
      data: { sessionId }
    }),
    // Update user's last active timestamp
    prisma.user.update({
      where: { id: userId },
      data: { lastActive: new Date() }
    })
  ]);
}

/**
 * Validates a profile token for a specific user UUID with session validation
 * Returns validation result and ensures token belongs to the requested user and session
 */
export async function validateProfileTokenForUser(token: string, requestedUuid: string, requestedUniverse: string, sessionId?: string): Promise<ProfileTokenValidationResult> {
  const result = await validateProfileToken(token);
  
  if (!result.valid) {
    return result;
  }

  // Additional check: ensure the token is for the requested user
  if (result.profileToken?.user.slUuid !== requestedUuid) {
    return { valid: false, error: 'Token does not match requested user' };
  }

  // Additional check: ensure the token is for the requested universe
  // We need to fetch the user again to check universe since it's not included in the current include
  const userWithUniverse = await prisma.user.findUnique({
    where: { id: result.profileToken?.user.id },
    select: { universe: true }
  });

  if (userWithUniverse?.universe?.toLowerCase() !== requestedUniverse?.toLowerCase()) {
    return { valid: false, error: 'Token does not match requested universe' };
  }

  // Session validation: if token has a sessionId, the provided sessionId must match
  if (result.profileToken?.sessionId && sessionId !== result.profileToken.sessionId) {
    return { valid: false, error: 'Token belongs to a different session' };
  }

  return result;
}