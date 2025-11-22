import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { gorAddToGroupSchema } from '@/lib/validation';
import {
  authenticateRequest,
  authErrorResponse,
  findUserInUniverse,
  parseUserGroups
} from '@/lib/socialUtils';

// POST /api/gor/social/groups/add - Add a user to a social group
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { player_uuid, universe, group_name, target_gorean_id, timestamp, signature, token, sessionId } = body;

    // Authenticate request (supports both token and signature)
    const authResult = await authenticateRequest(
      { player_uuid, universe: universe || 'gor', timestamp, signature, token, sessionId, group_name, target_gorean_id },
      gorAddToGroupSchema
    );

    if (!authResult.success) {
      return authErrorResponse(authResult);
    }

    // Find the requesting user
    const user = await findUserInUniverse(player_uuid, 'gor');

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found in Gor universe' },
        { status: 404 }
      );
    }

    // Verify target user exists
    const targetGoreanStats = await prisma.goreanStats.findUnique({
      where: { id: target_gorean_id },
      include: {
        user: {
          select: {
            slUuid: true,
            universe: true
          }
        }
      }
    });

    if (!targetGoreanStats) {
      return NextResponse.json(
        { success: false, error: 'Target user not found' },
        { status: 404 }
      );
    }

    // Verify target user is in Gor universe (case-insensitive)
    if (targetGoreanStats.user.universe?.toLowerCase() !== 'gor') {
      return NextResponse.json(
        { success: false, error: 'Target user is not in Gor universe' },
        { status: 400 }
      );
    }

    // Prevent adding self
    if (targetGoreanStats.userId === user.id) {
      return NextResponse.json(
        { success: false, error: 'Cannot add yourself to a group' },
        { status: 400 }
      );
    }

    // Parse current groups
    const groups = parseUserGroups(user.groups);

    // Initialize group if it doesn't exist
    if (!groups[group_name]) {
      groups[group_name] = [];
    }

    // Check if target is already in the group
    if (groups[group_name].includes(target_gorean_id)) {
      return NextResponse.json(
        { success: false, error: 'User is already in this group' },
        { status: 400 }
      );
    }

    // Add target to the group
    groups[group_name].push(target_gorean_id);

    // Update user's groups in database
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        groups: groups,
        lastActive: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        message: `${targetGoreanStats.characterName} added to ${group_name}`,
        groups: updatedUser.groups
      }
    });

  } catch (error: unknown) {
    console.error('Error adding user to group:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
