import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkUserSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sl_uuid = searchParams.get('sl_uuid');
    const universe = searchParams.get('universe');
    const timestamp = searchParams.get('timestamp');
    const signature = searchParams.get('signature');

    // Validate input using signature schema
    const { error } = checkUserSchema.validate({ sl_uuid, universe, timestamp, signature });
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

    // Find user and include their stats
    const user = await prisma.user.findFirst({
      where: {
        slUuid: sl_uuid!,
        universe: {
          equals: universe!,
          mode: 'insensitive'
        }
      },
      include: { stats: true }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Update last active timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() }
    });

    // Return user data with stats
    return NextResponse.json({ 
      success: true, 
      data: {
        id: user.id,
        sl_uuid: user.slUuid,
        universe: user.universe,
        username: user.username,
        role: user.role,
        title: user.title,
        titleColor: user.titleColor,
        status: user.stats?.status || 0,
        health: user.stats?.health || 100,
        hunger: user.stats?.hunger || 100,
        thirst: user.stats?.thirst || 100,
        goldCoin: user.stats?.goldCoin || 0,
        silverCoin: user.stats?.silverCoin || 0,
        copperCoin: user.stats?.copperCoin || 10,
        created_at: user.createdAt,
        last_active: user.lastActive
      }
    });

  } catch (error: unknown) {
    console.error('Error checking user:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input using our validation schema
    const { error, value } = checkUserSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { sl_uuid, universe, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find user and include their stats
    const user = await prisma.user.findFirst({
      where: {
        slUuid: sl_uuid,
        universe: {
          equals: universe,
          mode: 'insensitive'
        }
      },
      include: { stats: true }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Update last active timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() }
    });

    // Return user data with stats
    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        sl_uuid: user.slUuid,
        universe: user.universe,
        username: user.username,
        role: user.role,
        title: user.title,
        titleColor: user.titleColor,
        status: user.stats?.status || 0,
        health: user.stats?.health || 100,
        hunger: user.stats?.hunger || 100,
        thirst: user.stats?.thirst || 100,
        goldCoin: user.stats?.goldCoin || 0,
        silverCoin: user.stats?.silverCoin || 0,
        copperCoin: user.stats?.copperCoin || 10,
        created_at: user.createdAt,
        last_active: user.lastActive
      }
    });

  } catch (error: unknown) {
    console.error('Error checking user:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
