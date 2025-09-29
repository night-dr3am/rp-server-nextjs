import { NextRequest } from 'next/server';
import { GET } from '../route';
import { cleanupTestData, createSimpleTestUser, createTestSignature } from '@/__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';

// Removed LSL_SECRET_KEY as we now use universe-based signatures

describe('/api/npc/[npcId]', () => {
  let testUser: { id: string; slUuid: string; username: string };
  let testNpc: { id: number; npcId: string; name: string; maxDailyTasks: number };

  beforeEach(async () => {
    await cleanupTestData();

    // Create test user
    testUser = await createSimpleTestUser();

    // Create test NPC
    testNpc = await prisma.nPC.create({
      data: {
        npcId: 'test-npc-info',
        universe: 'Gor',
        name: 'Info Test NPC',
        description: 'An NPC for testing info retrieval',
        location: 'Test Location',
        maxDailyTasks: 5,
        taskInterval: 300,
        resetHour: 6,
        minRewardMult: 3,
        maxRewardMult: 7
      }
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('GET - NPC Information', () => {
    it('should retrieve NPC information successfully', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const url = new URL(`http://localhost:3000/api/npc/${testNpc.npcId}`);
      url.searchParams.set('universe', 'Gor');
      url.searchParams.set('timestamp', timestamp);
      url.searchParams.set('signature', signature);

      const request = new NextRequest(url.toString(), {
        method: 'GET'
      });

      const response = await GET(request, {
        params: Promise.resolve({ npcId: testNpc.npcId })
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.npcId).toBe(testNpc.npcId);
      expect(data.data.name).toBe('Info Test NPC');
      expect(data.data.description).toBe('An NPC for testing info retrieval');
      expect(data.data.location).toBe('Test Location');
      expect(data.data.maxDailyTasks).toBe(5);
      expect(data.data.taskInterval).toBe(300);
      expect(data.data.resetHour).toBe(6);
      expect(data.data.minRewardMult).toBe(3);
      expect(data.data.maxRewardMult).toBe(7);

      // Check stats structure
      expect(data.data.stats).toBeDefined();
      expect(data.data.stats.totalTasks).toBe(0);
      expect(data.data.stats.activeTasks).toBe(0);
      expect(data.data.stats.todaysTasks).toBe(0);
      expect(data.data.stats.completedToday).toBe(0);

      // Check recent tasks array
      expect(data.data.recentTasks).toEqual([]);
    });

    it('should include task statistics and recent tasks', async () => {
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      // Create various tasks for the NPC
      await prisma.nPCTask.createMany({
        data: [
          {
            npcId: testNpc.id,
            userId: testUser.id,
            itemName: 'Iron Sword',
            itemShortName: 'sword',
            quantity: 1,
            rewardCopper: 150,
            status: 'ASSIGNED',
            assignedAt: today,
            dailyCount: 1
          },
          {
            npcId: testNpc.id,
            userId: testUser.id,
            itemName: 'Steel Dagger',
            itemShortName: 'dagger',
            quantity: 2,
            rewardCopper: 100,
            status: 'COMPLETED',
            assignedAt: today,
            completedAt: today,
            dailyCount: 1
          },
          {
            npcId: testNpc.id,
            userId: testUser.id,
            itemName: 'Bronze Shield',
            itemShortName: 'shield',
            quantity: 1,
            rewardCopper: 200,
            status: 'COMPLETED',
            assignedAt: yesterday,
            completedAt: yesterday,
            dailyCount: 1
          }
        ]
      });

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const url = new URL(`http://localhost:3000/api/npc/${testNpc.npcId}`);
      url.searchParams.set('universe', 'Gor');
      url.searchParams.set('timestamp', timestamp);
      url.searchParams.set('signature', signature);

      const request = new NextRequest(url.toString(), {
        method: 'GET'
      });

      const response = await GET(request, {
        params: Promise.resolve({ npcId: testNpc.npcId })
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Check statistics
      expect(data.data.stats.totalTasks).toBe(3);
      expect(data.data.stats.activeTasks).toBe(1); // One ASSIGNED task
      expect(data.data.stats.todaysTasks).toBe(2); // Two tasks assigned today
      expect(data.data.stats.completedToday).toBe(1); // One completed today

      // Check recent tasks (should be ordered by assignedAt desc)
      expect(data.data.recentTasks).toHaveLength(3);
      expect(data.data.recentTasks[0].status).toBe('ASSIGNED'); // Most recent (Iron Sword, today)
      expect(data.data.recentTasks[1].status).toBe('COMPLETED'); // Second most recent (Steel Dagger, today)
      expect(data.data.recentTasks[2].status).toBe('COMPLETED'); // Oldest (Bronze Shield, yesterday)

      // Check task details
      const assignedTask = data.data.recentTasks.find((task: { status: string }) => task.status === 'ASSIGNED');
      expect(assignedTask.playerName).toBe(testUser.username);
      expect(assignedTask.playerUuid).toBe(testUser.slUuid);
      expect(assignedTask.itemName).toBe('Iron Sword');
      expect(assignedTask.quantity).toBe(1);
      expect(assignedTask.rewardCopper).toBe(150);
    });

    it('should return 404 for non-existent NPC', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const url = new URL('http://localhost:3000/api/npc/non-existent-npc');
      url.searchParams.set('universe', 'Gor');
      url.searchParams.set('timestamp', timestamp);
      url.searchParams.set('signature', signature);

      const request = new NextRequest(url.toString(), {
        method: 'GET'
      });

      const response = await GET(request, {
        params: Promise.resolve({ npcId: 'non-existent-npc' })
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('NPC not found');
    });

    it('should reject request with invalid signature', async () => {
      const timestamp = new Date().toISOString();
      const invalidSignature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // Valid hex format but wrong signature

      const url = new URL(`http://localhost:3000/api/npc/${testNpc.npcId}`);
      url.searchParams.set('universe', 'Gor');
      url.searchParams.set('timestamp', timestamp);
      url.searchParams.set('signature', invalidSignature);

      const request = new NextRequest(url.toString(), {
        method: 'GET'
      });

      const response = await GET(request, {
        params: Promise.resolve({ npcId: testNpc.npcId })
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid signature');
    });

    it('should reject request with missing parameters', async () => {
      const url = new URL(`http://localhost:3000/api/npc/${testNpc.npcId}`);
      // Missing timestamp and signature

      const request = new NextRequest(url.toString(), {
        method: 'GET'
      });

      const response = await GET(request, {
        params: Promise.resolve({ npcId: testNpc.npcId })
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid request parameters');
    });

    it('should use default Gor universe when not specified', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const url = new URL(`http://localhost:3000/api/npc/${testNpc.npcId}`);
      url.searchParams.set('timestamp', timestamp);
      url.searchParams.set('signature', signature);
      // Not setting universe - should default to Gor

      const request = new NextRequest(url.toString(), {
        method: 'GET'
      });

      const response = await GET(request, {
        params: Promise.resolve({ npcId: testNpc.npcId })
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.universe).toBe('Gor');
    });

    it('should not find NPC in different universe', async () => {
      // Create NPC in different universe
      const earthNpc = await prisma.nPC.create({
        data: {
          npcId: 'earth-npc',
          universe: 'Earth',
          name: 'Earth NPC',
          description: 'An NPC in Earth universe',
          location: 'Earth Location',
          maxDailyTasks: 3,
          taskInterval: 300,
          resetHour: 6,
          minRewardMult: 1,
          maxRewardMult: 3
        }
      });

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const url = new URL(`http://localhost:3000/api/npc/${earthNpc.npcId}`);
      url.searchParams.set('universe', 'Gor'); // Searching in Gor universe
      url.searchParams.set('timestamp', timestamp);
      url.searchParams.set('signature', signature);

      const request = new NextRequest(url.toString(), {
        method: 'GET'
      });

      const response = await GET(request, {
        params: Promise.resolve({ npcId: earthNpc.npcId })
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('NPC not found');
    });

    it('should limit recent tasks to 10 items', async () => {
      // Create 15 tasks to test the limit
      const tasks = [];
      for (let i = 0; i < 15; i++) {
        tasks.push({
          npcId: testNpc.id,
          userId: testUser.id,
          itemName: `Item ${i}`,
          itemShortName: `item${i}`,
          quantity: 1,
          rewardCopper: 100,
          status: 'COMPLETED',
          assignedAt: new Date(Date.now() - i * 60000), // Each task 1 minute apart
          completedAt: new Date(Date.now() - i * 60000 + 30000),
          dailyCount: 1
        });
      }

      await prisma.nPCTask.createMany({ data: tasks });

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const url = new URL(`http://localhost:3000/api/npc/${testNpc.npcId}`);
      url.searchParams.set('universe', 'Gor');
      url.searchParams.set('timestamp', timestamp);
      url.searchParams.set('signature', signature);

      const request = new NextRequest(url.toString(), {
        method: 'GET'
      });

      const response = await GET(request, {
        params: Promise.resolve({ npcId: testNpc.npcId })
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.stats.totalTasks).toBe(15);
      expect(data.data.recentTasks).toHaveLength(10); // Limited to 10

      // Should be in descending order by assignedAt
      expect(data.data.recentTasks[0].itemName).toBe('Item 0'); // Most recent
      expect(data.data.recentTasks[9].itemName).toBe('Item 9'); // 10th most recent
    });
  });
});