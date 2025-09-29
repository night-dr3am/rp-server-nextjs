import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { npcTaskCheckSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const { error, value } = npcTaskCheckSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid task check data', details: error.details },
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

    // Check for current active task
    const currentTask = await prisma.nPCTask.findFirst({
      where: {
        npcId: npc.id,
        userId: user.id,
        status: 'ASSIGNED'
      },
      orderBy: {
        assignedAt: 'desc'
      }
    });

    // Calculate task eligibility
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Count tasks assigned today for this player from this NPC
    const todaysTasks = await prisma.nPCTask.count({
      where: {
        npcId: npc.id,
        userId: user.id,
        assignedAt: {
          gte: todayStart
        }
      }
    });

    const canAssignNewTask = todaysTasks < npc.maxDailyTasks;

    // Check time interval for new task assignment
    let timeUntilNextTask = 0;
    if (canAssignNewTask) {
      const lastTask = await prisma.nPCTask.findFirst({
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

      if (lastTask) {
        const timeSinceLastTask = (now.getTime() - lastTask.assignedAt.getTime()) / 1000;
        if (timeSinceLastTask < npc.taskInterval) {
          timeUntilNextTask = Math.ceil(npc.taskInterval - timeSinceLastTask);
        }
      }
    }

    const response = {
      success: true,
      data: {
        npcInfo: {
          id: npc.id,
          npcId: npc.npcId,
          name: npc.name,
          maxDailyTasks: npc.maxDailyTasks,
          taskInterval: npc.taskInterval
        },
        playerStatus: {
          hasActiveTask: !!currentTask,
          tasksCompletedToday: todaysTasks,
          canAssignNewTask: canAssignNewTask && timeUntilNextTask === 0,
          timeUntilNextTask
        },
        currentTask: currentTask ? {
          id: currentTask.id,
          itemName: currentTask.itemName,
          itemShortName: currentTask.itemShortName,
          quantity: currentTask.quantity,
          rewardCopper: currentTask.rewardCopper,
          status: currentTask.status,
          assignedAt: currentTask.assignedAt,
          dailyCount: currentTask.dailyCount
        } : null
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Task check error:', error);

    return NextResponse.json(
      { success: false, error: 'Failed to check task status' },
      { status: 500 }
    );
  }
}