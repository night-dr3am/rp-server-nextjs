import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateProfileSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { Role } from '@prisma/client';

// POST /api/users/profile - Update user profile (name or role)
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

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        slUuid: sl_uuid,
        universe: {
          equals: universe,
          mode: 'insensitive'
        }
      }
    });

    if (!existingUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Prepare update data based on type
    const updateData: { username?: string; role?: Role; title?: string | null; titleColor?: string; lastActive: Date } = {
      lastActive: new Date()
    };

    if (update_type === 'name') {
      updateData.username = update_value;
    } else if (update_type === 'role') {
      // Convert role to uppercase to match enum in database
      updateData.role = update_value.toUpperCase() as Role;
    } else if (update_type === 'title') {
      // Title can be empty string to clear it
      updateData.title = update_value || null;
    } else if (update_type === 'titleColor') {
      updateData.titleColor = update_value;
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: {
        id: existingUser.id
      },
      data: updateData,
      include: { stats: true }
    });

    // Log the profile update event
    let eventType = 'PROFILE_UPDATED';
    let oldValue: string | null = null;
    let description = '';
    
    if (update_type === 'name') {
      eventType = 'PROFILE_NAME_CHANGED';
      oldValue = existingUser.username;
      description = `Name changed to: ${update_value}`;
    } else if (update_type === 'role') {
      eventType = 'PROFILE_ROLE_CHANGED';
      oldValue = existingUser.role;
      description = `Role changed to: ${update_value}`;
    } else if (update_type === 'title') {
      eventType = 'PROFILE_TITLE_CHANGED';
      oldValue = existingUser.title;
      description = update_value ? `Title changed to: ${update_value}` : 'Title cleared';
    } else if (update_type === 'titleColor') {
      eventType = 'PROFILE_TITLE_COLOR_CHANGED';
      oldValue = existingUser.titleColor;
      description = `Title color changed to: ${update_value}`;
    }
    
    await prisma.event.create({
      data: {
        userId: updatedUser.id,
        type: eventType,
        details: {
          description,
          update_type,
          old_value: oldValue,
          new_value: update_value
        }
      }
    });

    // Return success response with updated user data
    const messageMap: { [key: string]: string } = {
      name: 'Username updated successfully',
      role: 'Role updated successfully',
      title: update_value ? 'Title updated successfully' : 'Title cleared successfully',
      titleColor: 'Title color updated successfully'
    };
    
    return NextResponse.json({
      success: true,
      data: {
        message: messageMap[update_type],
        username: updatedUser.username,
        role: updatedUser.role,
        title: updatedUser.title,
        titleColor: updatedUser.titleColor,
        update_type,
        update_value,
        // Include stats for consistency with other endpoints
        health: updatedUser.stats?.health,
        hunger: updatedUser.stats?.hunger,
        thirst: updatedUser.stats?.thirst,
        goldCoin: updatedUser.stats?.goldCoin,
        silverCoin: updatedUser.stats?.silverCoin,
        copperCoin: updatedUser.stats?.copperCoin
      }
    });

  } catch (error: unknown) {
    console.error('Error updating user profile:', error);
    
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}