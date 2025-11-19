import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateProfileSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { Role } from '@prisma/client';

// POST /api/gor/users/profile - Update Gor user profile (name, role, title, titleColor)
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

    // Ensure universe is Gor
    if (universe.toLowerCase() !== 'gor') {
      return NextResponse.json(
        { success: false, error: 'This endpoint is only for Gor universe' },
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

    // Check if user exists with goreanStats
    const existingUser = await prisma.user.findFirst({
      where: {
        slUuid: sl_uuid,
        universe: {
          equals: universe,
          mode: 'insensitive'
        }
      },
      include: {
        goreanStats: true,
        stats: true
      }
    });

    if (!existingUser) {
      return NextResponse.json(
        { success: false, error: 'User not found in Gor universe' },
        { status: 404 }
      );
    }

    if (!existingUser.goreanStats) {
      return NextResponse.json(
        { success: false, error: 'User has no Gorean character' },
        { status: 404 }
      );
    }

    // Prepare update data
    const userUpdateData: { role?: Role; title?: string | null; titleColor?: string; lastActive: Date } = {
      lastActive: new Date()
    };

    const goreanUpdateData: { characterName?: string } = {};

    let oldValue: string | null = null;
    let description = '';
    let eventType = 'PROFILE_UPDATED';

    if (update_type === 'name') {
      // For Gor, update characterName in goreanStats instead of username
      goreanUpdateData.characterName = update_value;
      oldValue = existingUser.goreanStats.characterName;
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
        { success: false, error: 'Invalid update type for Gor profile' },
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
            id: existingUser.id
          },
          data: userUpdateData,
          include: {
            stats: true,
            goreanStats: true
          }
        });
      }

      // Update gorean stats if needed
      let updatedGoreanStats = updatedUser.goreanStats!;
      if (Object.keys(goreanUpdateData).length > 0) {
        updatedGoreanStats = await tx.goreanStats.update({
          where: { userId: updatedUser.id },
          data: goreanUpdateData
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

      return { user: updatedUser, goreanStats: updatedGoreanStats };
    });

    // Return success response with full Gorean user data
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
        // Return goreanStats taxonomy for LSL parsing
        goreanStats: {
          characterName: result.goreanStats.characterName,
          species: result.goreanStats.species,
          speciesVariant: result.goreanStats.speciesVariant,
          socialStatus: result.goreanStats.socialStatus,
          casteRole: result.goreanStats.casteRole
        },
        // Return User fields (title, titleColor)
        user: {
          title: result.user.title,
          titleColor: result.user.titleColor
        }
      }
    });

  } catch (error: unknown) {
    console.error('Error updating Gor user profile:', error);

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
