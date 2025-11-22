import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { gorRemoveFromGroupSchema } from '@/lib/validation';
import {
  authenticateRequest,
  authErrorResponse,
  findUserInUniverse,
  parseUserGroups
} from '@/lib/socialUtils';

// POST /api/gor/social/groups/remove - Remove a user from a social group
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { player_uuid, universe, group_name, target_gorean_id, timestamp, signature, token, sessionId } = body;

    // Authenticate request (supports both token and signature)
    const authResult = await authenticateRequest(
      { player_uuid, universe: universe || 'gor', timestamp, signature, token, sessionId, group_name, target_gorean_id },
      gorRemoveFromGroupSchema
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

    // Parse current groups
    const groups = parseUserGroups(user.groups);

    // Check if group exists
    if (!groups[group_name]) {
      return NextResponse.json(
        { success: false, error: `Group "${group_name}" not found` },
        { status: 404 }
      );
    }

    // Check if target is in the group
    if (!groups[group_name].includes(target_gorean_id)) {
      return NextResponse.json(
        { success: false, error: 'User is not in this group' },
        { status: 400 }
      );
    }

    // Remove target from the group
    groups[group_name] = groups[group_name].filter(id => id !== target_gorean_id);

    // Optionally remove empty groups (except default groups like "Allies" and "Enemies")
    const defaultGroups = ['Allies', 'Enemies'];
    if (groups[group_name].length === 0 && !defaultGroups.includes(group_name)) {
      delete groups[group_name];
    }

    // Fetch target character name for response message
    const targetGoreanStats = await prisma.goreanStats.findUnique({
      where: { id: target_gorean_id },
      select: { characterName: true }
    });

    const targetName = targetGoreanStats?.characterName || `User #${target_gorean_id}`;

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
        message: `${targetName} removed from ${group_name}`,
        groups: updatedUser.groups
      }
    });

  } catch (error: unknown) {
    console.error('Error removing user from group:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
