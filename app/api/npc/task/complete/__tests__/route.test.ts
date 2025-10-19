import { NextRequest } from 'next/server';
import { POST } from '../route';
import { cleanupTestData, createSimpleTestUser, createTestSignature } from '@/__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';

// Removed LSL_SECRET_KEY as we now use universe-based signatures

describe('/api/npc/task/complete', () => {
  let testUser: { id: string; slUuid: string; username: string; stats: { copperCoin: number } };
  let testNpc: { id: number; npcId: string; name: string };
  let testTask: { id: number; userId: string; itemName: string; itemShortName: string; quantity: number; rewardCopper: number };

  beforeEach(async () => {
    await cleanupTestData();

    // Create test user
    testUser = await createSimpleTestUser();

    // Create test NPC
    testNpc = await prisma.nPC.create({
      data: {
        npcId: 'test-complete-npc',
        universe: 'Gor',
        name: 'Task Completer NPC',
        description: 'An NPC for testing task completion',
        location: 'Completion Center',
        maxDailyTasks: 3,
        taskInterval: 300,
        resetHour: 6,
        minRewardMult: 3,
        maxRewardMult: 7
      }
    });

    // Create test task
    testTask = await prisma.nPCTask.create({
      data: {
        npcId: testNpc.id,
        userId: testUser.id,
        itemName: 'Iron Sword',
        itemShortName: 'iron_sword',
        quantity: 2,
        rewardCopper: 300,
        status: 'ASSIGNED',
        assignedAt: new Date(),
        dailyCount: 1
      }
    });

    // Create the item first
    const testItem = await prisma.rpItem.create({
      data: {
        shortName: 'iron_sword',
        name: 'Iron Sword',
        category: 'Weapon',
        tags: 'WEAPON',
        priceCopper: 50,
        universe: 'Gor'
      }
    });

    // Add required items to user's inventory
    await prisma.userInventory.create({
      data: {
        userId: testUser.id,
        rpItemId: testItem.id,
        quantity: 5, // More than required
        priceCopper: 50
      }
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('POST - Task Completion', () => {
    it('should complete task successfully', async () => {
      const initialCopper = testUser.stats.copperCoin;

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: testTask.id,
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.task.status).toBe('COMPLETED');
      expect(data.data.task.rewardCopper).toBe(300);
      expect(data.data.task.completedAt).toBeTruthy();

      // Verify task was updated in database
      const updatedTask = await prisma.nPCTask.findUnique({
        where: { id: testTask.id }
      });
      expect(updatedTask?.status).toBe('COMPLETED');
      expect(updatedTask?.completedAt).toBeTruthy();

      // Verify items were removed from inventory
      const item = await prisma.rpItem.findUnique({
        where: { shortName_universe: { shortName: 'iron_sword', universe: 'Gor' } }
      });
      const inventory = await prisma.userInventory.findFirst({
        where: {
          userId: testUser.id,
          rpItemId: item!.id
        }
      });
      expect(inventory?.quantity).toBe(3); // 5 - 2 = 3

      // Verify user received copper reward
      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
        include: { stats: true }
      });
      expect(updatedUser?.stats?.copperCoin).toBe(initialCopper + 300);
    });

    it('should fail when user does not have enough items', async () => {
      // Update inventory to have insufficient items
      const item1 = await prisma.rpItem.findUnique({
        where: { shortName_universe: { shortName: 'iron_sword', universe: 'Gor' } }
      });
      await prisma.userInventory.update({
        where: {
          userId_rpItemId: {
            userId: testUser.id,
            rpItemId: item1!.id
          }
        },
        data: { quantity: 1 } // Less than required 2
      });

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: testTask.id,
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Insufficient items in inventory');

      // Verify task was not completed
      const unchangedTask = await prisma.nPCTask.findUnique({
        where: { id: testTask.id }
      });
      expect(unchangedTask?.status).toBe('ASSIGNED');
    });

    it('should fail when user does not have the item', async () => {
      // Remove all items from inventory
      const item2 = await prisma.rpItem.findUnique({
        where: { shortName_universe: { shortName: 'iron_sword', universe: 'Gor' } }
      });
      await prisma.userInventory.deleteMany({
        where: {
          userId: testUser.id,
          rpItemId: item2!.id
        }
      });

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: testTask.id,
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Insufficient items in inventory');
    });

    it('should return 404 for non-existent task', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: 999999999, // Non-existent task ID - use very high number to avoid conflicts
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Task not found');
    });

    it('should reject completion by wrong player', async () => {
      // Create another user using the same helper function
      const anotherUser = await createSimpleTestUser();

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: testTask.id,
        playerUuid: anotherUser.slUuid, // Different player
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('does not belong to this player');
    });

    it('should reject completion of already completed task', async () => {
      // Mark task as already completed
      await prisma.nPCTask.update({
        where: { id: testTask.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: testTask.id,
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('not in assignable status');
    });

    it('should reject completion of declined task', async () => {
      // Mark task as declined
      await prisma.nPCTask.update({
        where: { id: testTask.id },
        data: { status: 'DECLINED' }
      });

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: testTask.id,
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('not in assignable status');
    });

    it('should reject request with invalid signature', async () => {
      const invalidSignature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // Valid hex format but wrong signature

      // Generate timestamp immediately before request to avoid expiration
      const requestData = {
        taskId: testTask.id,
        playerUuid: testUser.slUuid,
        timestamp: new Date().toISOString(),
        signature: invalidSignature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid signature');
    });

    it('should reject request with missing parameters', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        // Missing taskId
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid task completion data');
    });

    it('should create event log for task completion', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: testTask.id,
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Check that event was logged
      const event = await prisma.event.findFirst({
        where: {
          userId: testUser.id,
          type: 'NPC_TASK_COMPLETED'
        }
      });

      expect(event).toBeTruthy();
      expect(event?.details).toMatchObject({
        npcId: testNpc.npcId,
        npcName: testNpc.name,
        taskId: testTask.id,
        itemName: testTask.itemName,
        quantity: testTask.quantity,
        rewardCopper: testTask.rewardCopper
      });
    });

    it('should handle transaction rollback on error', async () => {
      const initialCopper = testUser.stats.copperCoin;
      const item5 = await prisma.rpItem.findUnique({
        where: { shortName_universe: { shortName: 'iron_sword', universe: 'Gor' } }
      });
      await prisma.userInventory.findFirst({
        where: {
          userId: testUser.id,
          rpItemId: item5!.id
        }
      });

      // Create a task but remove the inventory item to force a transaction rollback
      await prisma.userInventory.deleteMany({
        where: {
          userId: testUser.id
        }
      });

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: testTask.id,
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      // This should fail due to insufficient inventory
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);

      // Verify that no changes were made (transaction rolled back)
      const finalUser = await prisma.user.findUnique({
        where: { id: testUser.id },
        include: { stats: true }
      });
      expect(finalUser?.stats?.copperCoin).toBe(initialCopper);

      const item6 = await prisma.rpItem.findUnique({
        where: { shortName_universe: { shortName: 'iron_sword', universe: 'Gor' } }
      });
      const finalInventory = await prisma.userInventory.findFirst({
        where: {
          userId: testUser.id,
          rpItemId: item6!.id
        }
      });
      expect(finalInventory).toBeNull(); // Should be deleted as part of test setup

      const finalTask = await prisma.nPCTask.findUnique({
        where: { id: testTask.id }
      });
      expect(finalTask?.status).toBe('ASSIGNED'); // Should not be marked as completed
    });

    it('should handle exact quantity match', async () => {
      // Update inventory to have exactly the required quantity
      const item3 = await prisma.rpItem.findUnique({
        where: { shortName_universe: { shortName: 'iron_sword', universe: 'Gor' } }
      });
      await prisma.userInventory.update({
        where: {
          userId_rpItemId: {
            userId: testUser.id,
            rpItemId: item3!.id
          }
        },
        data: { quantity: 2 } // Exactly what's required
      });

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: testTask.id,
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify inventory item was completely removed
      const item4 = await prisma.rpItem.findUnique({
        where: { shortName_universe: { shortName: 'iron_sword', universe: 'Gor' } }
      });
      const inventory = await prisma.userInventory.findFirst({
        where: {
          userId: testUser.id,
          rpItemId: item4!.id
        }
      });
      expect(inventory).toBeNull(); // Should be deleted when quantity reaches 0
    });

    it('should include NPC and task information in response', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: testTask.id,
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.task).toBeDefined();
      expect(data.data.task.id).toBe(testTask.id);
      expect(data.data.task.itemName).toBe('Iron Sword');
      expect(data.data.task.quantity).toBe(2);
      expect(data.data.task.rewardCopper).toBe(300);
      expect(data.data.npcInfo).toBeDefined();
      expect(data.data.npcInfo.name).toBe('Task Completer NPC');
      expect(data.data.payment).toBeDefined();
      expect(data.data.inventoryChange).toBeDefined();
    });

    it('should reject completion of expired task from previous day', async () => {
      // Use the existing test user and NPC with quest items

      // Create a task from yesterday that's still assigned
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const oldTask = await prisma.nPCTask.create({
        data: {
          npcId: testNpc.id,
          userId: testUser.id,
          itemName: 'Iron Sword',
          itemShortName: 'iron_sword',
          quantity: 1,
          rewardCopper: 100,
          status: 'ASSIGNED',
          assignedAt: yesterday,
          dailyCount: 1
        }
      });

      // Add the required item to user's inventory
      const ironSwordItem = await prisma.rpItem.findUnique({
        where: { shortName_universe: { shortName: 'iron_sword', universe: 'Gor' } }
      });

      await prisma.userInventory.upsert({
        where: {
          userId_rpItemId: {
            userId: testUser.id,
            rpItemId: ironSwordItem!.id
          }
        },
        update: {
          quantity: 1
        },
        create: {
          userId: testUser.id,
          rpItemId: ironSwordItem!.id,
          quantity: 1
        }
      });

      // Attempt to complete the old task - this should fail
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: oldTask.id,
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Task has expired and cannot be completed');

      // Verify the old task was marked as expired
      const expiredTask = await prisma.nPCTask.findUnique({
        where: { id: oldTask.id }
      });
      expect(expiredTask?.status).toBe('EXPIRED');
    });

    it('should allow completion of task assigned today', async () => {
      // Use the existing test user and NPC with quest items

      // Create a task from today that's still assigned
      const todayTask = await prisma.nPCTask.create({
        data: {
          npcId: testNpc.id,
          userId: testUser.id,
          itemName: 'Iron Sword',
          itemShortName: 'iron_sword',
          quantity: 1,
          rewardCopper: 100,
          status: 'ASSIGNED',
          assignedAt: new Date(),
          dailyCount: 1
        }
      });

      // Add the required item to user's inventory
      const ironSwordItem = await prisma.rpItem.findUnique({
        where: { shortName_universe: { shortName: 'iron_sword', universe: 'Gor' } }
      });

      await prisma.userInventory.upsert({
        where: {
          userId_rpItemId: {
            userId: testUser.id,
            rpItemId: ironSwordItem!.id
          }
        },
        update: {
          quantity: 1
        },
        create: {
          userId: testUser.id,
          rpItemId: ironSwordItem!.id,
          quantity: 1
        }
      });

      // Attempt to complete today's task - this should succeed
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: todayTask.id,
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.task.id).toBe(todayTask.id);

      // Verify today's task was marked as completed
      const completedTask = await prisma.nPCTask.findUnique({
        where: { id: todayTask.id }
      });
      expect(completedTask?.status).toBe('COMPLETED');
    });

    it('should handle edge case of task assigned at midnight boundary', async () => {
      // Use the existing test user and NPC with quest items

      // Create a task assigned just after midnight today (should be valid)
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 1, 0); // 1 second after midnight today

      const midnightTask = await prisma.nPCTask.create({
        data: {
          npcId: testNpc.id,
          userId: testUser.id,
          itemName: 'Iron Sword',
          itemShortName: 'iron_sword',
          quantity: 1,
          rewardCopper: 100,
          status: 'ASSIGNED',
          assignedAt: todayMidnight,
          dailyCount: 1
        }
      });

      // Add the required item to user's inventory
      const ironSwordItem = await prisma.rpItem.findUnique({
        where: { shortName_universe: { shortName: 'iron_sword', universe: 'Gor' } }
      });

      await prisma.userInventory.upsert({
        where: {
          userId_rpItemId: {
            userId: testUser.id,
            rpItemId: ironSwordItem!.id
          }
        },
        update: {
          quantity: 1
        },
        create: {
          userId: testUser.id,
          rpItemId: ironSwordItem!.id,
          quantity: 1
        }
      });

      // Attempt to complete the task - this should succeed as it's from today
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: midnightTask.id,
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify the task was completed (not expired)
      const completedTask = await prisma.nPCTask.findUnique({
        where: { id: midnightTask.id }
      });
      expect(completedTask?.status).toBe('COMPLETED');
    });
  });
});