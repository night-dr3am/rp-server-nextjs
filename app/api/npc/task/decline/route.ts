import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateSignature } from '@/lib/signature';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, playerUuid, timestamp, signature } = body;

    // Find the task first to get universe for signature validation
    const task = await prisma.nPCTask.findUnique({
      where: { id: taskId },
      include: {
        npc: true,
        user: true
      }
    });

    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    // Validate signature using the universe from the task
    const signatureValidation = validateSignature(timestamp, signature, task.npc.universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify the player UUID matches the task
    if (task.user.slUuid !== playerUuid) {
      return NextResponse.json(
        { success: false, error: 'Task does not belong to this player' },
        { status: 403 }
      );
    }

    // Check if task is in ASSIGNED status
    if (task.status !== 'ASSIGNED') {
      return NextResponse.json(
        { success: false, error: 'Task is not in assignable status' },
        { status: 400 }
      );
    }

    // Update task status to declined
    const declinedTask = await prisma.nPCTask.update({
      where: { id: taskId },
      data: {
        status: 'DECLINED'
      }
    });

    // Create an event log for the task decline
    await prisma.event.create({
      data: {
        userId: task.userId,
        type: 'NPC_TASK_DECLINED',
        details: {
          npcId: task.npc.npcId,
          npcName: task.npc.name,
          taskId: task.id,
          itemName: task.itemName,
          itemShortName: task.itemShortName,
          quantity: task.quantity,
          rewardCopper: task.rewardCopper,
          dailyCount: task.dailyCount
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        task: {
          id: declinedTask.id,
          status: declinedTask.status
        },
        npcInfo: {
          name: task.npc.name,
          maxDailyTasks: task.npc.maxDailyTasks
        }
      }
    });

  } catch (error) {
    console.error('Task decline error:', error);

    return NextResponse.json(
      { success: false, error: 'Task decline failed' },
      { status: 500 }
    );
  }
}