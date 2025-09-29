import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStatsSchema, updateStatsSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

// GET /api/users/stats - Retrieve user statistics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sl_uuid = searchParams.get('sl_uuid');
    const universe = searchParams.get('universe');
    const timestamp = searchParams.get('timestamp');
    const signature = searchParams.get('signature');

    // Validate input using our validation schema
    const { error } = getStatsSchema.validate({ sl_uuid, universe, timestamp, signature });
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    // Validate signature
    const signatureValidation = validateSignature(timestamp!, signature!, universe!);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find user and their stats
    const user = await prisma.user.findFirst({
      where: {
        slUuid: sl_uuid!,
        universe: universe!
      },
      include: { stats: true }
    });

    if (!user || !user.stats) {
      return NextResponse.json(
        { success: false, error: 'User stats not found' },
        { status: 404 }
      );
    }

    // Update last active timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() }
    });

    // Return stats data
    return NextResponse.json({ 
      success: true, 
      data: {
        status: user.stats.status,
        health: user.stats.health,
        hunger: user.stats.hunger,
        thirst: user.stats.thirst,
        goldCoin: user.stats.goldCoin,
        silverCoin: user.stats.silverCoin,
        copperCoin: user.stats.copperCoin,
        last_updated: user.stats.lastUpdated,
        username: user.username,
        role: user.role,
        title: user.title,
        titleColor: user.titleColor
      }
    });

  } catch (error: unknown) {
    console.error('Error getting stats:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/users/stats - Update user statistics
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input using our validation schema
    const { error, value } = updateStatsSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { sl_uuid, universe, status:userStatus, health, hunger, thirst, goldCoin, silverCoin, copperCoin, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Prepare update data, only including fields if they're provided
    const updateData: {
      status?: number;
      health?: number;
      hunger?: number;
      thirst?: number;
      lastUpdated: Date;
      goldCoin?: number;
      silverCoin?: number;
      copperCoin?: number;
    } = {
      lastUpdated: new Date()
    };

    // Only update fields if they're provided in the request
    // Clamp stats values to valid ranges (0-100)
    if (userStatus !== undefined) updateData.status = Math.max(0, Math.min(100, userStatus));
    if (health !== undefined) updateData.health = Math.max(0, Math.min(100, health));
    if (hunger !== undefined) updateData.hunger = Math.max(0, Math.min(100, hunger));
    if (thirst !== undefined) updateData.thirst = Math.max(0, Math.min(100, thirst));
    if (goldCoin !== undefined) updateData.goldCoin = goldCoin;
    if (silverCoin !== undefined) updateData.silverCoin = silverCoin;
    if (copperCoin !== undefined) updateData.copperCoin = copperCoin;

    // Update user stats using a nested upsert through user relation
    const updatedUser = await prisma.user.update({
      where: {
        slUuid_universe: {
          slUuid: sl_uuid,
          universe: universe
        }
      },
      data: {
        lastActive: new Date(),
        stats: {
          upsert: {
            create: {
              ...updateData,
              health: updateData.health ?? 100,
              hunger: updateData.hunger ?? 100,
              thirst: updateData.thirst ?? 100,
              status: updateData.status ?? 0,
            },
            update: updateData
          }
        }
      },
      include: { stats: true }
    });

    // Return success response
    return NextResponse.json({
      success: true,
      data: {
        message: 'Stats updated successfully',
        status: updatedUser.stats?.status,
        health: updatedUser.stats?.health,
        hunger: updatedUser.stats?.hunger,
        thirst: updatedUser.stats?.thirst,
        goldCoin: updatedUser.stats?.goldCoin,
        silverCoin: updatedUser.stats?.silverCoin,
        copperCoin: updatedUser.stats?.copperCoin,
        last_updated: updatedUser.stats?.lastUpdated
      }
    });

  } catch (error: unknown) {
    console.error('Error updating stats:', error);
    
    // Handle case where user doesn't exist
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
