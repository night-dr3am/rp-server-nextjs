import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { npcTaskAssignSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const { error, value } = npcTaskAssignSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid task assignment data', details: error.details },
        { status: 400 }
      );
    }

    const { npcId, playerUuid, universe, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find the NPC
    const npc = await prisma.nPC.findUnique({
      where: {
        npcId_universe: { npcId, universe }
      }
    });

    if (!npc) {
      return NextResponse.json(
        { success: false, error: 'NPC not found' },
        { status: 404 }
      );
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: {
        slUuid_universe: { slUuid: playerUuid, universe }
      }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Check daily task limit and time intervals
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // First, expire any old tasks from previous days
    await prisma.nPCTask.updateMany({
      where: {
        npcId: npc.id,
        userId: user.id,
        status: 'ASSIGNED',
        assignedAt: {
          lt: todayStart
        }
      },
      data: {
        status: 'EXPIRED'
      }
    });

    // Check if player already has an active task from this NPC (only today's tasks)
    const existingTask = await prisma.nPCTask.findFirst({
      where: {
        npcId: npc.id,
        userId: user.id,
        status: 'ASSIGNED',
        assignedAt: {
          gte: todayStart
        }
      }
    });

    if (existingTask) {
      return NextResponse.json({
        success: true,
        data: {
          taskExists: true,
          task: {
            id: existingTask.id,
            itemName: existingTask.itemName,
            itemShortName: existingTask.itemShortName,
            quantity: existingTask.quantity,
            rewardCopper: existingTask.rewardCopper,
            status: existingTask.status,
            assignedAt: existingTask.assignedAt,
            dailyCount: existingTask.dailyCount
          }
        }
      });
    }

    // Count tasks assigned today for this player from this NPC
    const todaysTasks = await prisma.nPCTask.findMany({
      where: {
        npcId: npc.id,
        userId: user.id,
        assignedAt: {
          gte: todayStart
        }
      },
      orderBy: {
        assignedAt: 'desc'
      }
    });

    // Check daily limit
    if (todaysTasks.length >= npc.maxDailyTasks) {
      return NextResponse.json(
        { success: false, error: 'Daily task limit reached' },
        { status: 429 }
      );
    }

    // Check time interval if there are previous tasks
    if (todaysTasks.length > 0) {
      const lastTask = todaysTasks[0];
      const timeSinceLastTask = (now.getTime() - lastTask.assignedAt.getTime()) / 1000;

      if (timeSinceLastTask < npc.taskInterval) {
        const remainingTime = Math.ceil(npc.taskInterval - timeSinceLastTask);
        return NextResponse.json(
          {
            success: false,
            error: 'Task interval not met',
            remainingTime: remainingTime
          },
          { status: 429 }
        );
      }
    }

    // Get a random quest item from the database
    const questItems = await prisma.rpItem.findMany({
      where: {
        universe,
        tags: {
          contains: 'DAILY-QUEST',
          mode: 'insensitive'
        }
      }
    });

    if (questItems.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No quest items available' },
        { status: 503 }
      );
    }

    // Select random item
    const randomItem = questItems[Math.floor(Math.random() * questItems.length)];

    // Calculate reward
    const multiplier = npc.minRewardMult + Math.floor(Math.random() * (npc.maxRewardMult - npc.minRewardMult + 1));
    const rewardCopper = randomItem.priceCopper * multiplier;

    // Calculate daily count
    const dailyCount = todaysTasks.length + 1;

    // Create the task
    const newTask = await prisma.nPCTask.create({
      data: {
        npcId: npc.id,
        userId: user.id,
        itemShortName: randomItem.shortName,
        itemName: randomItem.name,
        quantity: 1, // Default quantity for now
        rewardCopper,
        status: 'ASSIGNED',
        dailyCount
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        taskExists: false,
        task: {
          id: newTask.id,
          itemName: newTask.itemName,
          itemShortName: newTask.itemShortName,
          quantity: newTask.quantity,
          rewardCopper: newTask.rewardCopper,
          status: newTask.status,
          assignedAt: newTask.assignedAt,
          dailyCount: newTask.dailyCount
        },
        npcInfo: {
          name: npc.name,
          maxDailyTasks: npc.maxDailyTasks,
          tasksCompletedToday: dailyCount
        }
      }
    });

  } catch (error) {
    console.error('Task assignment error:', error);

    let errorMessage = 'Task assignment failed';
    let statusCode = 500;

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        errorMessage = 'Task assignment conflict';
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