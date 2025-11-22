import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaRemoveFromGroupSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { validateProfileTokenForUser } from '@/lib/profileTokenUtils';

// POST /api/arkana/social/groups/remove - Remove a user from a social group
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
      // LSL-based authentication using signature validation
      const { error, value } = arkanaRemoveFromGroupSchema.validate({ player_uuid, universe, group_name, target_arkana_id, timestamp, signature });
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

    // Find the requesting user (case-insensitive)
    const user = await prisma.user.findFirst({
      where: { slUuid: player_uuid, universe: { equals: 'arkana', mode: 'insensitive' } }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found in Arkana universe' },
        { status: 404 }
      );
    }

    // Parse current groups
    const groups = (user.groups as Record<string, number[]>) || {};

    // Check if group exists
    if (!groups[group_name]) {
      return NextResponse.json(
        { success: false, error: `Group "${group_name}" not found` },
        { status: 404 }
      );
    }

    // Check if target is in the group
    if (!groups[group_name].includes(target_arkana_id)) {
      return NextResponse.json(
        { success: false, error: 'User is not in this group' },
        { status: 400 }
      );
    }

    // Remove target from the group
    groups[group_name] = groups[group_name].filter(id => id !== target_arkana_id);

    // Optionally remove empty groups (except default groups like "Allies" and "Enemies")
    const defaultGroups = ['Allies', 'Enemies'];
    if (groups[group_name].length === 0 && !defaultGroups.includes(group_name)) {
      delete groups[group_name];
    }

    // Fetch target character name for response message
    const targetArkanaStats = await prisma.arkanaStats.findUnique({
      where: { id: target_arkana_id },
      select: { characterName: true }
    });

    const targetName = targetArkanaStats?.characterName || `User #${target_arkana_id}`;

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
