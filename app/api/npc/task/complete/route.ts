import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { npcTaskCompleteSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const { error, value } = npcTaskCompleteSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid task completion data', details: error.details },
        { status: 400 }
      );
    }

    const { taskId, playerUuid, timestamp, signature } = value;

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

    // Check if task is expired (assigned before today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    if (task.assignedAt < todayStart) {
      // Mark as expired and return error
      await prisma.nPCTask.update({
        where: { id: taskId },
        data: { status: 'EXPIRED' }
      });

      return NextResponse.json(
        { success: false, error: 'Task has expired and cannot be completed' },
        { status: 400 }
      );
    }

    // Start a transaction to handle inventory removal and task completion
    const result = await prisma.$transaction(async (tx) => {
      // 1. Check if player has the required item in inventory
      const inventoryItem = await tx.userInventory.findUnique({
        where: {
          userId_rpItemId: {
            userId: task.userId,
            rpItemId: await tx.rpItem.findUnique({
              where: {
                shortName_universe: {
                  shortName: task.itemShortName,
                  universe: task.npc.universe
                }
              },
              select: { id: true }
            }).then(item => item?.id || 0)
          }
        }
      });

      if (!inventoryItem || inventoryItem.quantity < task.quantity) {
        throw new Error('Insufficient items in inventory');
      }

      // 2. Remove items from inventory
      if (inventoryItem.quantity === task.quantity) {
        // Remove the entire inventory entry
        await tx.userInventory.delete({
          where: {
            userId_rpItemId: {
              userId: task.userId,
              rpItemId: inventoryItem.rpItemId
            }
          }
        });
      } else {
        // Reduce the quantity
        await tx.userInventory.update({
          where: {
            userId_rpItemId: {
              userId: task.userId,
              rpItemId: inventoryItem.rpItemId
            }
          },
          data: {
            quantity: {
              decrement: task.quantity
            }
          }
        });
      }

      // 3. Get or create user stats for currency payout
      let userStats = await tx.userStats.findUnique({
        where: { userId: task.userId }
      });

      if (!userStats) {
        userStats = await tx.userStats.create({
          data: {
            userId: task.userId,
            copperCoin: task.rewardCopper
          }
        });
      } else {
        userStats = await tx.userStats.update({
          where: { userId: task.userId },
          data: {
            copperCoin: {
              increment: task.rewardCopper
            }
          }
        });
      }

      // 4. Update task status to completed
      const completedTask = await tx.nPCTask.update({
        where: { id: taskId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });

      // 5. Create an event log for the task completion
      await tx.event.create({
        data: {
          userId: task.userId,
          type: 'NPC_TASK_COMPLETED',
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

      return {
        completedTask,
        newCopperBalance: userStats.copperCoin,
        itemRemoved: {
          shortName: task.itemShortName,
          quantity: task.quantity
        }
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        task: {
          id: result.completedTask.id,
          itemName: result.completedTask.itemName,
          itemShortName: result.completedTask.itemShortName,
          quantity: result.completedTask.quantity,
          rewardCopper: result.completedTask.rewardCopper,
          status: result.completedTask.status,
          assignedAt: result.completedTask.assignedAt,
          completedAt: result.completedTask.completedAt,
          dailyCount: result.completedTask.dailyCount
        },
        payment: {
          copperReceived: task.rewardCopper,
          newCopperBalance: result.newCopperBalance
        },
        inventoryChange: result.itemRemoved,
        npcInfo: {
          name: task.npc.name,
          maxDailyTasks: task.npc.maxDailyTasks
        }
      }
    });

  } catch (error) {
    console.error('Task completion error:', error);

    let errorMessage = 'Task completion failed';
    let statusCode = 500;

    if (error instanceof Error) {
      if (error.message === 'Insufficient items in inventory') {
        errorMessage = error.message;
        statusCode = 400;
      } else {
        errorMessage = error.message;
      }
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        errorMessage = 'Task completion conflict';
        statusCode = 409;
      }
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: statusCode }
    );
  }
}