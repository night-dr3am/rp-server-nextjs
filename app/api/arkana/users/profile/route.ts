import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateProfileSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { Role } from '@prisma/client';
import { sanitizeForLSL, encodeForLSL } from '@/lib/stringUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input using our validation schema
    const { error, value } = updateProfileSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { sl_uuid, universe, update_type, update_value, timestamp, signature } = value;

    // Ensure universe is arkana
    if (universe !== 'arkana') {
      return NextResponse.json(
        { success: false, error: 'This endpoint is only for Arkana universe' },
        { status: 400 }
      );
    }

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user exists with arkanaStats
    const existingUser = await prisma.user.findFirst({
      where: {
        slUuid: sl_uuid,
        universe: universe
      },
      include: {
        arkanaStats: true,
        stats: true
      }
    });

    if (!existingUser) {
      return NextResponse.json(
        { success: false, error: 'User not found in Arkana universe' },
        { status: 404 }
      );
    }

    if (!existingUser.arkanaStats) {
      return NextResponse.json(
        { success: false, error: 'User has no Arkana character' },
        { status: 404 }
      );
    }

    // Prepare update data
    const userUpdateData: { role?: Role; title?: string | null; titleColor?: string; lastActive: Date } = {
      lastActive: new Date()
    };

    const arkanaUpdateData: { characterName?: string } = {};

    let oldValue: string | null = null;
    let description = '';
    let eventType = 'PROFILE_UPDATED';

    if (update_type === 'name') {
      // For Arkana, update characterName in arkanaStats instead of username
      arkanaUpdateData.characterName = update_value;
      oldValue = existingUser.arkanaStats.characterName;
      eventType = 'PROFILE_NAME_CHANGED';
      description = `Character name changed to: ${update_value}`;
    } else if (update_type === 'role') {
      // Update role in main user table
      userUpdateData.role = update_value.toUpperCase() as Role;
      oldValue = existingUser.role;
      eventType = 'PROFILE_ROLE_CHANGED';
      description = `Role changed to: ${update_value}`;
    } else if (update_type === 'title') {
      // Update title in main user table
      userUpdateData.title = update_value || null;
      oldValue = existingUser.title;
      eventType = 'PROFILE_TITLE_CHANGED';
      description = update_value ? `Title changed to: ${update_value}` : 'Title cleared';
    } else if (update_type === 'titleColor') {
      // Update titleColor in main user table
      userUpdateData.titleColor = update_value;
      oldValue = existingUser.titleColor;
      eventType = 'PROFILE_TITLE_COLOR_CHANGED';
      description = `Title color changed to: ${update_value}`;
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid update type for Arkana profile' },
        { status: 400 }
      );
    }

    // Perform updates in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update user data if needed
      let updatedUser = existingUser;
      if (Object.keys(userUpdateData).length > 1) { // More than just lastActive
        updatedUser = await tx.user.update({
          where: {
            slUuid_universe: {
              slUuid: sl_uuid,
              universe: universe
            }
          },
          data: userUpdateData,
          include: {
            stats: true,
            arkanaStats: true
          }
        });
      }

      // Update arkana stats if needed
      let updatedArkanaStats = updatedUser.arkanaStats!;
      if (Object.keys(arkanaUpdateData).length > 0) {
        updatedArkanaStats = await tx.arkanaStats.update({
          where: { userId: updatedUser.id },
          data: arkanaUpdateData
        });
      }

      // Log the profile update event
      await tx.event.create({
        data: {
          userId: updatedUser.id,
          type: eventType,
          details: {
            oldValue,
            newValue: update_value,
            description,
            updateType: update_type
          }
        }
      });

      return { user: updatedUser, arkanaStats: updatedArkanaStats };
    });

    // Return success response with full Arkana user data
    const messageMap: { [key: string]: string } = {
      name: 'Character name updated successfully',
      role: 'Role updated successfully',
      title: update_value ? 'Title updated successfully' : 'Title cleared successfully',
      titleColor: 'Title color updated successfully'
    };

    return NextResponse.json({
      success: true,
      data: {
        message: messageMap[update_type],
        update_type,
        update_value,
        // Return characterName instead of username for Arkana
        // URL-encode for LSL UTF-8 support (Japanese, Chinese, emoji, etc.)
        characterName: encodeForLSL(result.arkanaStats.characterName),
        role: result.user.role,
        title: encodeForLSL(result.user.title),
        titleColor: result.user.titleColor,
        // Include full arkanaStats for LSL parsing
        hasArkanaCharacter: "true",  // String for LSL compatibility
        arkanaStats: {
          id: result.arkanaStats.id,
          characterName: encodeForLSL(result.arkanaStats.characterName),
          agentName: encodeForLSL(result.arkanaStats.agentName),
          aliasCallsign: encodeForLSL(result.arkanaStats.aliasCallsign),
          faction: encodeForLSL(result.arkanaStats.faction),
          conceptRole: encodeForLSL(result.arkanaStats.conceptRole),
          job: encodeForLSL(result.arkanaStats.job),
          background: encodeForLSL(sanitizeForLSL(result.arkanaStats.background, 50)),
          race: encodeForLSL(result.arkanaStats.race),
          subrace: encodeForLSL(result.arkanaStats.subrace),
          archetype: encodeForLSL(result.arkanaStats.archetype),
          physical: result.arkanaStats.physical,
          dexterity: result.arkanaStats.dexterity,
          mental: result.arkanaStats.mental,
          perception: result.arkanaStats.perception,
          hitPoints: result.arkanaStats.hitPoints,
          credits: result.arkanaStats.credits,
          chips: result.arkanaStats.chips,
          xp: result.arkanaStats.xp,
          createdAt: result.arkanaStats.createdAt
        }
      }
    });

  } catch (error: unknown) {
    console.error('Error updating Arkana user profile:', error);

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}