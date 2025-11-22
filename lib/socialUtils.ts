import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateSignature } from '@/lib/signature';
import { validateProfileTokenForUser } from '@/lib/profileTokenUtils';
import Joi from 'joi';

// Authentication parameters (generic to allow additional endpoint-specific fields)
export interface AuthParams {
  player_uuid: string;
  universe: string;
  timestamp?: string;
  signature?: string;
  token?: string;
  sessionId?: string;
}

export type AuthResult = {
  success: boolean;
  error?: string;
  status?: number;
};

/**
 * Authenticate a request using either token or signature-based auth
 * Supports both web (JWT token) and LSL (signature) authentication
 */
export async function authenticateRequest<T extends AuthParams>(
  params: T,
  schema?: Joi.ObjectSchema
): Promise<AuthResult> {
  const { player_uuid, universe, timestamp, signature, token, sessionId } = params;

  if (token) {
    // Web-based authentication using JWT token with session validation
    const tokenValidation = await validateProfileTokenForUser(
      token,
      player_uuid || '',
      universe,
      sessionId
    );

    if (!tokenValidation.valid) {
      return {
        success: false,
        error: tokenValidation.error || 'Invalid token',
        status: 401
      };
    }
    return { success: true };
  } else {
    // LSL-based authentication using signature
    if (schema) {
      // Strip out token/sessionId as they're not in LSL schemas
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { token: _token, sessionId: _sessionId, ...schemaParams } = params;
      const { error, value } = schema.validate(schemaParams);

      if (error) {
        return {
          success: false,
          error: error.details[0].message,
          status: 400
        };
      }

      const signatureValidation = validateSignature(
        value.timestamp,
        value.signature,
        value.universe
      );

      if (!signatureValidation.valid) {
        return {
          success: false,
          error: signatureValidation.error || 'Unauthorized',
          status: 401
        };
      }
    } else {
      // No schema provided, just validate signature
      if (!timestamp || !signature) {
        return {
          success: false,
          error: 'Missing timestamp or signature',
          status: 400
        };
      }

      const signatureValidation = validateSignature(timestamp, signature, universe);
      if (!signatureValidation.valid) {
        return {
          success: false,
          error: signatureValidation.error || 'Unauthorized',
          status: 401
        };
      }
    }

    return { success: true };
  }
}

/**
 * Helper to create authentication error response
 */
export function authErrorResponse(result: AuthResult): NextResponse {
  return NextResponse.json(
    { success: false, error: result.error },
    { status: result.status || 401 }
  );
}

/**
 * Find a user in a specific universe (case-insensitive)
 */
export async function findUserInUniverse(
  slUuid: string,
  universe: string
) {
  return prisma.user.findFirst({
    where: {
      slUuid,
      universe: {
        equals: universe,
        mode: 'insensitive'
      }
    }
  });
}

/**
 * Find a user in Gor universe with goreanStats
 */
export async function findGorUserWithStats(slUuid: string) {
  return prisma.user.findFirst({
    where: {
      slUuid,
      universe: {
        equals: 'gor',
        mode: 'insensitive'
      }
    },
    include: {
      goreanStats: true
    }
  });
}

/**
 * Find a user in Arkana universe with arkanaStats
 */
export async function findArkanaUserWithStats(slUuid: string) {
  return prisma.user.findFirst({
    where: {
      slUuid,
      universe: {
        equals: 'arkana',
        mode: 'insensitive'
      }
    },
    include: {
      arkanaStats: true
    }
  });
}

/**
 * Parse user groups JSON safely
 */
export function parseUserGroups(groups: unknown): Record<string, number[]> {
  if (!groups) return {};
  if (typeof groups === 'object') {
    return groups as Record<string, number[]>;
  }
  return {};
}

/**
 * Update user's last active timestamp
 */
export async function updateLastActive(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { lastActive: new Date() }
  });
}

/**
 * Default groups that should be kept even when empty
 */
export const DEFAULT_GROUPS = ['Allies', 'Enemies'];

/**
 * Enrich group member IDs with character data
 * Works for both Gor (goreanStats) and Arkana (arkanaStats)
 */
export async function enrichGorGroups(
  groups: Record<string, number[]>
): Promise<Record<string, Array<{
  goreanId: number;
  characterName: string;
  slUuid: string;
}>>> {
  // Collect all unique member IDs
  const allMemberIds = new Set<number>();
  Object.values(groups).forEach(memberIds => {
    memberIds.forEach(id => allMemberIds.add(id));
  });

  if (allMemberIds.size === 0) {
    // Return empty groups structure
    const emptyGroups: Record<string, Array<{ goreanId: number; characterName: string; slUuid: string }>> = {};
    for (const groupName of Object.keys(groups)) {
      emptyGroups[groupName] = [];
    }
    return emptyGroups;
  }

  // Fetch all member data in a single query
  const members = await prisma.goreanStats.findMany({
    where: {
      id: { in: Array.from(allMemberIds) }
    },
    select: {
      id: true,
      characterName: true,
      user: {
        select: { slUuid: true }
      }
    }
  });

  // Create lookup map
  const memberMap = new Map(
    members.map(m => [m.id, {
      goreanId: m.id,
      characterName: m.characterName,
      slUuid: m.user.slUuid
    }])
  );

  // Enrich groups
  const enrichedGroups: Record<string, Array<{
    goreanId: number;
    characterName: string;
    slUuid: string;
  }>> = {};

  for (const [groupName, memberIds] of Object.entries(groups)) {
    enrichedGroups[groupName] = memberIds
      .map(id => memberMap.get(id))
      .filter((member): member is NonNullable<typeof member> => member !== undefined);
  }

  return enrichedGroups;
}

/**
 * Enrich Arkana groups with character data
 */
export async function enrichArkanaGroups(
  groups: Record<string, number[]>
): Promise<Record<string, Array<{
  arkanaId: number;
  characterName: string;
  slUuid: string;
}>>> {
  // Collect all unique member IDs
  const allMemberIds = new Set<number>();
  Object.values(groups).forEach(memberIds => {
    memberIds.forEach(id => allMemberIds.add(id));
  });

  if (allMemberIds.size === 0) {
    const emptyGroups: Record<string, Array<{ arkanaId: number; characterName: string; slUuid: string }>> = {};
    for (const groupName of Object.keys(groups)) {
      emptyGroups[groupName] = [];
    }
    return emptyGroups;
  }

  // Fetch all member data
  const members = await prisma.arkanaStats.findMany({
    where: {
      id: { in: Array.from(allMemberIds) }
    },
    select: {
      id: true,
      characterName: true,
      user: {
        select: { slUuid: true }
      }
    }
  });

  // Create lookup map
  const memberMap = new Map(
    members.map(m => [m.id, {
      arkanaId: m.id,
      characterName: m.characterName,
      slUuid: m.user.slUuid
    }])
  );

  // Enrich groups
  const enrichedGroups: Record<string, Array<{
    arkanaId: number;
    characterName: string;
    slUuid: string;
  }>> = {};

  for (const [groupName, memberIds] of Object.entries(groups)) {
    enrichedGroups[groupName] = memberIds
      .map(id => memberMap.get(id))
      .filter((member): member is NonNullable<typeof member> => member !== undefined);
  }

  return enrichedGroups;
}
