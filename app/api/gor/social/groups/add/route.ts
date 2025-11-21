import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { gorAddToGroupSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { validateProfileTokenForUser } from '@/lib/profileTokenUtils';

// POST /api/gor/social/groups/add - Add a user to a social group
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { player_uuid, universe, group_name, target_gorean_id, timestamp, signature, token, sessionId } = body;

    // Support both token-based (web) and signature-based (LSL) authentication
    if (token) {
      // Web-based authentication using JWT token with session validation
      const tokenValidation = await validateProfileTokenForUser(token, player_uuid || '', universe || 'gor', sessionId || undefined);
      if (!tokenValidation.valid) {
        return NextResponse.json(
          { success: false, error: tokenValidation.error || 'Invalid token' },
          { status: 401 }
        );
      }
    } else {
      // LSL-based authentication using signature
      const { error, value } = gorAddToGroupSchema.validate({ player_uuid, universe, group_name, target_gorean_id, timestamp, signature });
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
      where: { slUuid: player_uuid, universe: 'gor' }
    });

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

    // Verify target user is in Gor universe
    if (targetGoreanStats.user.universe !== 'gor') {
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
    const groups = (user.groups as Record<string, number[]>) || {};

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
