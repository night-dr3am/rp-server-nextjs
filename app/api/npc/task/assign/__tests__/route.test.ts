import { NextRequest } from 'next/server';
import { POST } from '../route';
import { cleanupTestData, createSimpleTestUser, createTestSignature } from '@/__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';

// Removed LSL_SECRET_KEY as we now use universe-based signatures

describe('/api/npc/task/assign', () => {
  let testUser: { id: string; slUuid: string; username: string; stats: { copperCoin: number } };
  let testNpc: { id: number; npcId: string; maxDailyTasks: number; minRewardMult: number; maxRewardMult: number };
  // let testItems: unknown[];

  beforeEach(async () => {
    await cleanupTestData();

    // Create test user
    testUser = await createSimpleTestUser();

    // Create test NPC
    testNpc = await prisma.nPC.create({
      data: {
        npcId: 'test-assign-npc',
        universe: 'Gor',
        name: 'Task Assigner NPC',
        description: 'An NPC for testing task assignment',
        location: 'Assignment Center',
        maxDailyTasks: 3,
        taskInterval: 300, // 5 minutes
        resetHour: 6,
        minRewardMult: 3,
        maxRewardMult: 7
      }
    });

    // Create test items with DAILY-QUEST tag
    await prisma.rpItem.createMany({
      data: [
        {
          shortName: 'iron_sword',
          name: 'Iron Sword',
          category: 'Weapon',
          tags: 'WEAPON,DAILY-QUEST',
          priceCopper: 50,
          universe: 'Gor'
        },
        {
          shortName: 'leather_armor',
          name: 'Leather Armor',
          category: 'Armor',
          tags: 'ARMOR,DAILY-QUEST',
          priceCopper: 75,
          universe: 'Gor'
        },
        {
          shortName: 'health_potion',
          name: 'Health Potion',
          category: 'Consumable',
          tags: 'CONSUMABLE,DAILY-QUEST',
          priceCopper: 25,
          universe: 'Gor'
        },
        {
          shortName: 'rare_gem',
          name: 'Rare Gem',
          category: 'Valuable',
          tags: 'VALUABLE',
          priceCopper: 200,
          universe: 'Gor'
        }
      ]
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('POST - Task Assignment', () => {
    it('should assign a task successfully', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        npcId: testNpc.npcId,
        playerUuid: testUser.slUuid,
        universe: 'Gor',
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.task).toBeDefined();
      expect(data.data.npcInfo.name).toBe('Task Assigner NPC');
      expect(data.data.task.status).toBe('ASSIGNED');
      expect(data.data.task.dailyCount).toBe(1);

      // Should assign one of the DAILY-QUEST items
      const validItems = ['Iron Sword', 'Leather Armor', 'Health Potion'];
      expect(validItems).toContain(data.data.task.itemName);

      // Verify task was created in database
      const task = await prisma.nPCTask.findFirst({
        where: {
          npcId: testNpc.id,
          userId: testUser.id,
          status: 'ASSIGNED'
        }
      });
      expect(task).toBeTruthy();
      expect(task?.quantity).toBeGreaterThan(0);
      expect(task?.rewardCopper).toBeGreaterThan(0);
    });

    it('should respect daily task limits', async () => {
      // Create maximum allowed tasks for today
      const today = new Date();
      await prisma.nPCTask.createMany({
        data: Array.from({ length: testNpc.maxDailyTasks }, (_, i) => ({
          npcId: testNpc.id,
          userId: testUser.id,
          itemName: `Previous Task ${i}`,
          itemShortName: `task${i}`,
          quantity: 1,
          rewardCopper: 100,
          status: 'COMPLETED',
          assignedAt: today,
          completedAt: today,
          dailyCount: i + 1
        }))
      });

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        npcId: testNpc.npcId,
        playerUuid: testUser.slUuid,
        universe: 'Gor',
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Daily task limit');
    });

    it('should respect task interval cooldown', async () => {
      // Create a recent task within the interval
      const recentTime = new Date(Date.now() - 60000); // 1 minute ago (less than 5 minute interval)
      await prisma.nPCTask.create({
        data: {
          npcId: testNpc.id,
          userId: testUser.id,
          itemName: 'Recent Task',
          itemShortName: 'recent',
          quantity: 1,
          rewardCopper: 100,
          status: 'COMPLETED',
          assignedAt: recentTime,
          completedAt: recentTime,
          dailyCount: 1
        }
      });

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        npcId: testNpc.npcId,
        playerUuid: testUser.slUuid,
        universe: 'Gor',
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Task interval not met');
    });

    it('should not assign if player has active task', async () => {
      // Create an active task
      await prisma.nPCTask.create({
        data: {
          npcId: testNpc.id,
          userId: testUser.id,
          itemName: 'Active Task',
          itemShortName: 'active',
          quantity: 1,
          rewardCopper: 100,
          status: 'ASSIGNED',
          assignedAt: new Date(),
          dailyCount: 1
        }
      });

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        npcId: testNpc.npcId,
        playerUuid: testUser.slUuid,
        universe: 'Gor',
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.taskExists).toBe(true);
      expect(data.data.task.status).toBe('ASSIGNED');
    });

    it('should return 404 for non-existent NPC', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        npcId: 'non-existent-npc',
        playerUuid: testUser.slUuid,
        universe: 'Gor',
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('NPC not found');
    });

    it('should return 404 for non-existent user', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        npcId: testNpc.npcId,
        playerUuid: '00000000-0000-0000-0000-000000000000',
        universe: 'Gor',
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('User not found');
    });

    it('should handle no available quest items', async () => {
      // Delete all quest items
      await prisma.rpItem.deleteMany({
        where: {
          tags: {
            contains: 'DAILY-QUEST'
          }
        }
      });

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        npcId: testNpc.npcId,
        playerUuid: testUser.slUuid,
        universe: 'Gor',
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.success).toBe(false);
      expect(data.error).toContain('No quest items available');
    });

    it('should reject request with invalid signature', async () => {
      const timestamp = new Date().toISOString();
      const invalidSignature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // Valid hex format but wrong signature

      const requestData = {
        npcId: testNpc.npcId,
        playerUuid: testUser.slUuid,
        universe: 'Gor',
        timestamp,
        signature: invalidSignature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/assign', {
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
        // Missing npcId
        playerUuid: testUser.slUuid,
        universe: 'Gor',
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid task assignment data');
    });

    it('should calculate reward within multiplier range', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        npcId: testNpc.npcId,
        playerUuid: testUser.slUuid,
        universe: 'Gor',
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Get the assigned item to calculate expected reward range
      const assignedItem = await prisma.rpItem.findFirst({
        where: {
          name: data.data.task.itemName
        }
      });

      if (assignedItem) {
        const minReward = assignedItem.priceCopper * testNpc.minRewardMult;
        const maxReward = assignedItem.priceCopper * testNpc.maxRewardMult;

        expect(data.data.task.rewardCopper).toBeGreaterThanOrEqual(minReward);
        expect(data.data.task.rewardCopper).toBeLessThanOrEqual(maxReward);
      }
    });


    it('should allow task after cooldown period has passed', async () => {
      // Create a task that is older than the interval
      const oldTime = new Date(Date.now() - 400000); // 400 seconds ago (more than 300 second interval)
      await prisma.nPCTask.create({
        data: {
          npcId: testNpc.id,
          userId: testUser.id,
          itemName: 'Old Task',
          itemShortName: 'old',
          quantity: 1,
          rewardCopper: 100,
          status: 'COMPLETED',
          assignedAt: oldTime,
          completedAt: oldTime,
          dailyCount: 1
        }
      });

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        npcId: testNpc.npcId,
        playerUuid: testUser.slUuid,
        universe: 'Gor',
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.task.dailyCount).toBe(2); // Should be the second task today
    });
  });
});