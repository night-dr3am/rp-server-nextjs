import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { gorGetGroupsSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { validateProfileTokenForUser } from '@/lib/profileTokenUtils';

// GET /api/gor/social/groups - Retrieve user's social groups with enriched member data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const player_uuid = searchParams.get('player_uuid');
    const universe = searchParams.get('universe');
    const timestamp = searchParams.get('timestamp');
    const signature = searchParams.get('signature');
    const token = searchParams.get('token');
    const sessionId = searchParams.get('sessionId') || undefined;

    // Support both token-based (web) and signature-based (LSL) authentication
    let authValid = false;

    if (token) {
      // Web-based authentication using JWT token with session validation
      const tokenValidation = await validateProfileTokenForUser(token, player_uuid || '', universe || 'gor', sessionId);
      authValid = tokenValidation.valid;

      if (!authValid) {
        return NextResponse.json(
          { success: false, error: tokenValidation.error || 'Invalid token' },
          { status: 401 }
        );
      }
    } else {
      // LSL-based authentication using signature
      const { error, value } = gorGetGroupsSchema.validate({ player_uuid, universe, timestamp, signature });
      if (error) {
        return NextResponse.json(
          { success: false, error: error.details[0].message },
          { status: 400 }
        );
      }

      const signatureValidation = validateSignature(value.timestamp, value.signature, value.universe);
      if (!signatureValidation.valid) {
        return NextResponse.json(
          { success: false, error: signatureValidation.error || 'Unauthorized' },
          { status: 401 }
        );
      }
      authValid = true;
    }

    if (!authValid) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Find user in Gor universe (case-insensitive)
    const user = await prisma.user.findFirst({
      where: { slUuid: player_uuid!, universe: { equals: 'gor', mode: 'insensitive' } }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found in Gor universe' },
        { status: 404 }
      );
    }

    // Update last active timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() }
    });

    // Parse groups JSON (default to empty object if null)
    const groups = (user.groups as Record<string, number[]>) || {};

    // Collect all unique goreanStats IDs from all groups
    const allMemberIds = new Set<number>();
    Object.values(groups).forEach(memberIds => {
      memberIds.forEach(id => allMemberIds.add(id));
    });

    // Fetch all member data in a single query
    const members = await prisma.goreanStats.findMany({
      where: {
        id: {
          in: Array.from(allMemberIds)
        }
      },
      select: {
        id: true,
        characterName: true,
        user: {
          select: {
            slUuid: true
          }
        }
      }
    });

    // Create a lookup map for quick access
    const memberMap = new Map(
      members.map(m => [m.id, {
        goreanId: m.id,
        characterName: m.characterName,
        slUuid: m.user.slUuid
      }])
    );

    // Enrich groups with member details
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

    // Return groups with enriched member data
    return NextResponse.json({
      success: true,
      data: {
        groups: enrichedGroups
      }
    });

  } catch (error: unknown) {
    console.error('Error fetching social groups:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
