import { NextRequest } from 'next/server';
import { POST } from '../route';
import { cleanupTestData, createSimpleTestUser, createTestSignature } from '@/__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';

// Removed LSL_SECRET_KEY as we now use universe-based signatures

describe('/api/npc/task/check', () => {
  let testUser: { id: string; slUuid: string; username: string };
  let testNpc: { id: number; npcId: string; maxDailyTasks: number };

  beforeEach(async () => {
    await cleanupTestData();

    // Create test user
    testUser = await createSimpleTestUser();

    // Create test NPC
    testNpc = await prisma.nPC.create({
      data: {
        npcId: 'test-check-npc',
        universe: 'Gor',
        name: 'Task Checker NPC',
        description: 'An NPC for testing task checking',
        location: 'Check Center',
        maxDailyTasks: 3,
        taskInterval: 300, // 5 minutes
        resetHour: 6,
        minRewardMult: 3,
        maxRewardMult: 7
      }
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('POST - Task Status Check', () => {
    it('should return no active task when user has no tasks', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        npcId: testNpc.npcId,
        playerUuid: testUser.slUuid,
        universe: 'Gor',
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.playerStatus.hasActiveTask).toBe(false);
      expect(data.data.currentTask).toBeNull();
      expect(data.data.playerStatus.canAssignNewTask).toBe(true);
      expect(data.data.playerStatus.tasksCompletedToday).toBe(0);
      expect(data.data.npcInfo.maxDailyTasks - data.data.playerStatus.tasksCompletedToday).toBe(3);
    });

    it('should return active task when user has assigned task', async () => {
      // Create an active task
      const activeTask = await prisma.nPCTask.create({
        data: {
          npcId: testNpc.id,
          userId: testUser.id,
          itemName: 'Iron Sword',
          itemShortName: 'iron_sword',
          quantity: 2,
          rewardCopper: 150,
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

      const request = new NextRequest('http://localhost:3000/api/npc/task/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.playerStatus.hasActiveTask).toBe(true);
      expect(data.data.currentTask).toBeDefined();
      expect(data.data.currentTask.id).toBe(activeTask.id);
      expect(data.data.currentTask.itemName).toBe('Iron Sword');
      expect(data.data.currentTask.quantity).toBe(2);
      expect(data.data.currentTask.rewardCopper).toBe(150);
      expect(data.data.currentTask.status).toBe('ASSIGNED');
      expect(data.data.playerStatus.canAssignNewTask).toBe(false);
    });

    it('should calculate daily task statistics correctly', async () => {
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      // Create completed tasks for today and yesterday
      await prisma.nPCTask.createMany({
        data: [
          // Today's tasks (assigned today)
          {
            npcId: testNpc.id,
            userId: testUser.id,
            itemName: 'Task 1',
            itemShortName: 'task1',
            quantity: 1,
            rewardCopper: 100,
            status: 'COMPLETED',
            assignedAt: todayStart, // Use start of today to ensure it's counted
            completedAt: today,
            dailyCount: 1
          },
          {
            npcId: testNpc.id,
            userId: testUser.id,
            itemName: 'Task 2',
            itemShortName: 'task2',
            quantity: 1,
            rewardCopper: 100,
            status: 'COMPLETED',
            assignedAt: todayStart, // Use start of today to ensure it's counted
            completedAt: today,
            dailyCount: 2
          },
          // Yesterday's task (should not count)
          {
            npcId: testNpc.id,
            userId: testUser.id,
            itemName: 'Yesterday Task',
            itemShortName: 'yesterday',
            quantity: 1,
            rewardCopper: 100,
            status: 'COMPLETED',
            assignedAt: yesterday,
            completedAt: yesterday,
            dailyCount: 1
          }
        ]
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

      const request = new NextRequest('http://localhost:3000/api/npc/task/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.playerStatus.tasksCompletedToday).toBe(2);
      expect(data.data.npcInfo.maxDailyTasks - data.data.playerStatus.tasksCompletedToday).toBe(1); // 3 max - 2 completed = 1 remaining
      expect(data.data.playerStatus.canAssignNewTask).toBe(true);
    });

    it('should indicate cannot receive new task when daily limit reached', async () => {
      const today = new Date();

      // Create maximum daily tasks (3)
      await prisma.nPCTask.createMany({
        data: Array.from({ length: testNpc.maxDailyTasks }, (_, i) => ({
          npcId: testNpc.id,
          userId: testUser.id,
          itemName: `Task ${i + 1}`,
          itemShortName: `task${i + 1}`,
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

      const request = new NextRequest('http://localhost:3000/api/npc/task/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.playerStatus.tasksCompletedToday).toBe(3);
      expect(data.data.npcInfo.maxDailyTasks - data.data.playerStatus.tasksCompletedToday).toBe(0);
      expect(data.data.playerStatus.canAssignNewTask).toBe(false);
      // Note: The actual endpoint doesn't return a reason field in this structure
    });

    it('should indicate cannot receive new task due to cooldown', async () => {
      // Create a recent task within the cooldown period
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

      const request = new NextRequest('http://localhost:3000/api/npc/task/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.playerStatus.canAssignNewTask).toBe(false);
      expect(data.data.playerStatus.timeUntilNextTask).toBeGreaterThan(0);
    });

    it('should allow new task after cooldown period', async () => {
      // Create an old task beyond the cooldown period (300 seconds)
      // Use current time minus 400 seconds, ensuring it stays within today
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const fourHundredSecondsAgo = new Date(Date.now() - 400000);

      // If 400 seconds ago would be yesterday (we're in the first 7 minutes of the day),
      // use 1 hour after midnight instead
      const oldTime = fourHundredSecondsAgo.getTime() < todayStart.getTime()
        ? new Date(todayStart.getTime() + 3600000) // 1 hour after midnight
        : fourHundredSecondsAgo; // 400 seconds ago
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

      const request = new NextRequest('http://localhost:3000/api/npc/task/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.playerStatus.canAssignNewTask).toBe(true);
      expect(data.data.playerStatus.tasksCompletedToday).toBe(1);
      expect(data.data.npcInfo.maxDailyTasks - data.data.playerStatus.tasksCompletedToday).toBe(2);
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

      const request = new NextRequest('http://localhost:3000/api/npc/task/check', {
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

      const request = new NextRequest('http://localhost:3000/api/npc/task/check', {
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

      const request = new NextRequest('http://localhost:3000/api/npc/task/check', {
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

      const request = new NextRequest('http://localhost:3000/api/npc/task/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid task check data');
    });

    it('should handle declined tasks correctly', async () => {
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      // Create a declined task (assigned today)
      await prisma.nPCTask.create({
        data: {
          npcId: testNpc.id,
          userId: testUser.id,
          itemName: 'Declined Task',
          itemShortName: 'declined',
          quantity: 1,
          rewardCopper: 100,
          status: 'DECLINED',
          assignedAt: todayStart, // Assigned today, but declined
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

      const request = new NextRequest('http://localhost:3000/api/npc/task/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.playerStatus.hasActiveTask).toBe(false);
      expect(data.data.currentTask).toBeNull();
      // Declined tasks are still counted in daily task limit (assigned today)
      expect(data.data.playerStatus.tasksCompletedToday).toBe(1);
      expect(data.data.npcInfo.maxDailyTasks - data.data.playerStatus.tasksCompletedToday).toBe(2);
    });

    it('should include NPC information in response', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        npcId: testNpc.npcId,
        playerUuid: testUser.slUuid,
        universe: 'Gor',
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.npcInfo).toBeDefined();
      expect(data.data.npcInfo.name).toBe('Task Checker NPC');
      expect(data.data.npcInfo.maxDailyTasks).toBe(3);
      expect(data.data.npcInfo.taskInterval).toBe(300);
    });

    it('should expire old assigned tasks from previous days', async () => {
      // Use the existing test user and NPC

      // Create a task from yesterday that's still assigned
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const oldTask = await prisma.nPCTask.create({
        data: {
          npcId: testNpc.id,
          userId: testUser.id,
          itemName: 'Old Task',
          itemShortName: 'old_task',
          quantity: 1,
          rewardCopper: 100,
          status: 'ASSIGNED',
          assignedAt: yesterday,
          dailyCount: 1
        }
      });

      // Check task status - this should expire the old task
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        npcId: testNpc.npcId,
        playerUuid: testUser.slUuid,
        universe: 'Gor',
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.playerStatus.hasActiveTask).toBe(false);
      expect(data.data.currentTask).toBeNull();

      // Verify the old task was marked as expired
      const expiredTask = await prisma.nPCTask.findUnique({
        where: { id: oldTask.id }
      });
      expect(expiredTask?.status).toBe('EXPIRED');
    });

    it('should not expire tasks assigned today', async () => {
      // Use the existing test user and NPC

      // Create a task from today
      const todayTask = await prisma.nPCTask.create({
        data: {
          npcId: testNpc.id,
          userId: testUser.id,
          itemName: 'Today Task',
          itemShortName: 'today_task',
          quantity: 1,
          rewardCopper: 100,
          status: 'ASSIGNED',
          assignedAt: new Date(),
          dailyCount: 1
        }
      });

      // Check task status - this should NOT expire today's task
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        npcId: testNpc.npcId,
        playerUuid: testUser.slUuid,
        universe: 'Gor',
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.playerStatus.hasActiveTask).toBe(true);
      expect(data.data.currentTask).toBeDefined();
      expect(data.data.currentTask.id).toBe(todayTask.id);

      // Verify today's task is still assigned
      const currentTask = await prisma.nPCTask.findUnique({
        where: { id: todayTask.id }
      });
      expect(currentTask?.status).toBe('ASSIGNED');
    });

    it('should handle multiple old tasks and expire all of them', async () => {
      // Use the existing test user and NPC

      // Create multiple old tasks from different previous days
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const oldTask1 = await prisma.nPCTask.create({
        data: {
          npcId: testNpc.id,
          userId: testUser.id,
          itemName: 'Old Task 1',
          itemShortName: 'old_task_1',
          quantity: 1,
          rewardCopper: 100,
          status: 'ASSIGNED',
          assignedAt: twoDaysAgo,
          dailyCount: 1
        }
      });

      const oldTask2 = await prisma.nPCTask.create({
        data: {
          npcId: testNpc.id,
          userId: testUser.id,
          itemName: 'Old Task 2',
          itemShortName: 'old_task_2',
          quantity: 1,
          rewardCopper: 150,
          status: 'ASSIGNED',
          assignedAt: yesterday,
          dailyCount: 1
        }
      });

      // Check task status - this should expire both old tasks
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        npcId: testNpc.npcId,
        playerUuid: testUser.slUuid,
        universe: 'Gor',
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.playerStatus.hasActiveTask).toBe(false);

      // Verify both old tasks were marked as expired
      const expiredTask1 = await prisma.nPCTask.findUnique({
        where: { id: oldTask1.id }
      });
      const expiredTask2 = await prisma.nPCTask.findUnique({
        where: { id: oldTask2.id }
      });

      expect(expiredTask1?.status).toBe('EXPIRED');
      expect(expiredTask2?.status).toBe('EXPIRED');
    });
  });
});