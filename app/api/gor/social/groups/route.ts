import { NextRequest, NextResponse } from 'next/server';
import { gorGetGroupsSchema } from '@/lib/validation';
import {
  authenticateRequest,
  authErrorResponse,
  findUserInUniverse,
  updateLastActive,
  parseUserGroups,
  enrichGorGroups
} from '@/lib/socialUtils';

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

    // Authenticate request (supports both token and signature)
    const authResult = await authenticateRequest(
      { player_uuid: player_uuid || '', universe: universe || 'gor', timestamp: timestamp || undefined, signature: signature || undefined, token: token || undefined, sessionId },
      gorGetGroupsSchema
    );

    if (!authResult.success) {
      return authErrorResponse(authResult);
    }

    // Find user in Gor universe
    const user = await findUserInUniverse(player_uuid!, 'gor');

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found in Gor universe' },
        { status: 404 }
      );
    }

    // Update last active timestamp
    await updateLastActive(user.id);

    // Parse and enrich groups with member data
    const groups = parseUserGroups(user.groups);
    const enrichedGroups = await enrichGorGroups(groups);

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
