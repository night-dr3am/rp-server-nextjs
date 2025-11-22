import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaAddToGroupSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { validateProfileTokenForUser } from '@/lib/profileTokenUtils';

// POST /api/arkana/social/groups/add - Add a user to a social group
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { player_uuid, universe, group_name, target_arkana_id, timestamp, signature, token, sessionId } = body;

    // Support both token-based (web) and signature-based (LSL) authentication
    if (token) {
      // Web-based authentication using JWT token with session validation
      const tokenValidation = await validateProfileTokenForUser(token, player_uuid || '', universe || 'arkana', sessionId || undefined);
      if (!tokenValidation.valid) {
        return NextResponse.json(
          { success: false, error: tokenValidation.error || 'Invalid token' },
          { status: 401 }
        );
      }
    } else {
      // LSL-based authentication using signature
      const { error, value } = arkanaAddToGroupSchema.validate({ player_uuid, universe, group_name, target_arkana_id, timestamp, signature });
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
    }

    // Find the requesting user
    const user = await prisma.user.findFirst({
      where: { slUuid: player_uuid, universe: 'arkana' }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found in Arkana universe' },
        { status: 404 }
      );
    }

    // Verify target user exists
    const targetArkanaStats = await prisma.arkanaStats.findUnique({
      where: { id: target_arkana_id },
      include: {
        user: {
          select: {
            slUuid: true,
            universe: true
          }
        }
      }
    });

    if (!targetArkanaStats) {
      return NextResponse.json(
        { success: false, error: 'Target user not found' },
        { status: 404 }
      );
    }

    // Verify target user is in Arkana universe (case-insensitive)
    if (targetArkanaStats.user.universe?.toLowerCase() !== 'arkana') {
      return NextResponse.json(
        { success: false, error: 'Target user is not in Arkana universe' },
        { status: 400 }
      );
    }

    // Prevent adding self
    if (targetArkanaStats.userId === user.id) {
      return NextResponse.json(
        { success: false, error: 'Cannot add yourself to a group' },
        { status: 400 }
      );
    }

    // Parse current groups
    const groups = (user.groups as Record<string, number[]>) || {};

    // Initialize group if it doesn't exist
    if (!groups[group_name]) {
      groups[group_name] = [];
    }

    // Check if target is already in the group
    if (groups[group_name].includes(target_arkana_id)) {
      return NextResponse.json(
        { success: false, error: 'User is already in this group' },
        { status: 400 }
      );
    }

    // Add target to the group
    groups[group_name].push(target_arkana_id);

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
        message: `${targetArkanaStats.characterName} added to ${group_name}`,
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
