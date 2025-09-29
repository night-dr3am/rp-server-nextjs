import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { npcRegistrationSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const { error, value } = npcRegistrationSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid NPC data', details: error.details },
        { status: 400 }
      );
    }

    const {
      npcId,
      universe,
      name,
      description,
      location,
      maxDailyTasks,
      taskInterval,
      resetHour,
      minRewardMult,
      maxRewardMult,
      timestamp,
      signature
    } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Try to find existing NPC or create new one
    const npc = await prisma.nPC.upsert({
      where: {
        npcId_universe: {
          npcId,
          universe
        }
      },
      update: {
        name,
        description,
        location,
        maxDailyTasks,
        taskInterval,
        resetHour,
        minRewardMult,
        maxRewardMult,
        updatedAt: new Date()
      },
      create: {
        npcId,
        universe,
        name,
        description,
        location,
        maxDailyTasks,
        taskInterval,
        resetHour,
        minRewardMult,
        maxRewardMult
      },
      include: {
        _count: {
          select: {
            tasks: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        id: npc.id,
        npcId: npc.npcId,
        universe: npc.universe,
        name: npc.name,
        description: npc.description,
        location: npc.location,
        maxDailyTasks: npc.maxDailyTasks,
        taskInterval: npc.taskInterval,
        resetHour: npc.resetHour,
        minRewardMult: npc.minRewardMult,
        maxRewardMult: npc.maxRewardMult,
        totalTasks: npc._count.tasks,
        createdAt: npc.createdAt,
        updatedAt: npc.updatedAt
      }
    });

  } catch (error) {
    console.error('NPC registration error:', error);

    let errorMessage = 'NPC registration failed';
    let statusCode = 500;

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        errorMessage = 'NPC with this ID already exists';
        statusCode = 409;
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: statusCode }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const universe = searchParams.get('universe') || 'Gor';
    const timestamp = searchParams.get('timestamp');
    const signature = searchParams.get('signature');

    // Validate required parameters
    if (!timestamp || !signature) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: timestamp and signature' },
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

    const npcs = await prisma.nPC.findMany({
      where: {
        universe
      },
      include: {
        _count: {
          select: {
            tasks: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    // Format the response
    const npcsWithStats = npcs.map(npc => ({
      id: npc.id,
      npcId: npc.npcId,
      universe: npc.universe,
      name: npc.name,
      description: npc.description,
      location: npc.location,
      maxDailyTasks: npc.maxDailyTasks,
      taskInterval: npc.taskInterval,
      resetHour: npc.resetHour,
      minRewardMult: npc.minRewardMult,
      maxRewardMult: npc.maxRewardMult,
      totalTasks: npc._count.tasks,
      createdAt: npc.createdAt,
      updatedAt: npc.updatedAt
    }));

    return NextResponse.json({
      success: true,
      data: npcsWithStats
    });

  } catch (error) {
    console.error('NPC listing error:', error);

    return NextResponse.json(
      { success: false, error: 'Failed to retrieve NPCs' },
      { status: 500 }
    );
  }
}