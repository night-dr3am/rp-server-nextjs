import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { npcInfoSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ npcId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { searchParams } = new URL(request.url);
    const universe = searchParams.get('universe') || 'Gor';
    const timestamp = searchParams.get('timestamp');
    const signature = searchParams.get('signature');

    // Validate the request
    const { error, value } = npcInfoSchema.validate({
      npcId: resolvedParams.npcId,
      universe,
      timestamp,
      signature
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid request parameters', details: error.details },
        { status: 400 }
      );
    }

    // Validate signature
    const signatureValidation = validateSignature(value.timestamp, value.signature, value.universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find the NPC
    const npc = await prisma.nPC.findUnique({
      where: {
        npcId_universe: {
          npcId: resolvedParams.npcId,
          universe: value.universe
        }
      },
      include: {
        _count: {
          select: {
            tasks: true
          }
        },
        tasks: {
          include: {
            user: {
              select: {
                username: true,
                slUuid: true
              }
            }
          },
          orderBy: {
            assignedAt: 'desc'
          },
          take: 10 // Last 10 tasks for debugging
        }
      }
    });

    if (!npc) {
      return NextResponse.json(
        { success: false, error: 'NPC not found' },
        { status: 404 }
      );
    }

    // Calculate current active tasks and daily stats
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const activeTasks = npc.tasks.filter(task => task.status === 'ASSIGNED').length;
    const todaysTasks = npc.tasks.filter(task => task.assignedAt >= todayStart).length;
    const completedToday = npc.tasks.filter(task =>
      task.status === 'COMPLETED' && task.assignedAt >= todayStart
    ).length;

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
        stats: {
          totalTasks: npc._count.tasks,
          activeTasks,
          todaysTasks,
          completedToday
        },
        recentTasks: npc.tasks.map(task => ({
          id: task.id,
          playerName: task.user.username,
          playerUuid: task.user.slUuid,
          itemName: task.itemName,
          itemShortName: task.itemShortName,
          quantity: task.quantity,
          rewardCopper: task.rewardCopper,
          status: task.status,
          assignedAt: task.assignedAt,
          completedAt: task.completedAt,
          dailyCount: task.dailyCount
        })),
        createdAt: npc.createdAt,
        updatedAt: npc.updatedAt
      }
    });

  } catch (error) {
    console.error('NPC info retrieval error:', error);

    return NextResponse.json(
      { success: false, error: 'Failed to retrieve NPC information' },
      { status: 500 }
    );
  }
}