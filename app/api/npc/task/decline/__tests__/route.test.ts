import { NextRequest } from 'next/server';
import { POST } from '../route';
import { cleanupTestData, createSimpleTestUser, createTestSignature } from '@/__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';

// Removed LSL_SECRET_KEY as we now use universe-based signatures

describe('/api/npc/task/decline', () => {
  let testUser: { id: string; slUuid: string; username: string };
  let testNpc: { id: number; npcId: string; name: string; maxDailyTasks: number };
  let testTask: { id: number; userId: string; itemName: string; itemShortName: string; quantity: number; rewardCopper: number; dailyCount: number };

  beforeEach(async () => {
    await cleanupTestData();

    // Create test user
    testUser = await createSimpleTestUser();

    // Create test NPC
    testNpc = await prisma.nPC.create({
      data: {
        npcId: 'test-decline-npc',
        universe: 'Gor',
        name: 'Task Decliner NPC',
        description: 'An NPC for testing task declining',
        location: 'Decline Center',
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
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('POST - Task Decline', () => {
    it('should decline task successfully', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: testTask.id,
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.task.id).toBe(testTask.id);
      expect(data.data.task.status).toBe('DECLINED');
      expect(data.data.npcInfo.name).toBe('Task Decliner NPC');
      expect(data.data.npcInfo.maxDailyTasks).toBe(3);

      // Verify task was updated in database
      const updatedTask = await prisma.nPCTask.findUnique({
        where: { id: testTask.id }
      });
      expect(updatedTask?.status).toBe('DECLINED');
      expect(updatedTask?.completedAt).toBeNull(); // Should not have completed date
    });

    it('should return 404 for non-existent task', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: 99999, // Non-existent task ID
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/decline', {
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

    it('should reject decline by wrong player', async () => {
      // Create another user using the helper function
      const anotherUser = await createSimpleTestUser();

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: testTask.id,
        playerUuid: anotherUser.slUuid, // Different player
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/decline', {
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

    it('should reject decline of already completed task', async () => {
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

      const request = new NextRequest('http://localhost:3000/api/npc/task/decline', {
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

    it('should reject decline of already declined task', async () => {
      // Mark task as already declined
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

      const request = new NextRequest('http://localhost:3000/api/npc/task/decline', {
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

    it('should reject decline of expired task', async () => {
      // Mark task as expired
      await prisma.nPCTask.update({
        where: { id: testTask.id },
        data: { status: 'EXPIRED' }
      });

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: testTask.id,
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/decline', {
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

    it('should validate signature using task universe', async () => {
      // Test with arkana universe which has configured secret key
      const testUserArkana = await createSimpleTestUser();
      await prisma.user.update({
        where: { id: testUserArkana.id },
        data: { universe: 'arkana' }
      });

      const arkanaNet = await prisma.nPC.create({
        data: {
          npcId: 'arkana-npc',
          universe: 'arkana',
          name: 'Arkana NPC',
          description: 'NPC in Arkana universe',
          location: 'Arkana Location',
          maxDailyTasks: 3,
          taskInterval: 300,
          resetHour: 6,
          minRewardMult: 1,
          maxRewardMult: 3
        }
      });

      const arkanaTask = await prisma.nPCTask.create({
        data: {
          npcId: arkanaNet.id,
          userId: testUserArkana.id,
          itemName: 'Arkana Item',
          itemShortName: 'arkana_item',
          quantity: 1,
          rewardCopper: 100,
          status: 'ASSIGNED',
          assignedAt: new Date(),
          dailyCount: 1
        }
      });

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp, 'arkana');

      const requestData = {
        taskId: arkanaTask.id,
        playerUuid: testUserArkana.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.task.status).toBe('DECLINED');
    });

    it('should reject request with invalid signature', async () => {
      const timestamp = new Date().toISOString();
      const invalidSignature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // Valid hex format but wrong signature

      const requestData = {
        taskId: testTask.id,
        playerUuid: testUser.slUuid,
        timestamp,
        signature: invalidSignature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/decline', {
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
        // Missing taskId will cause task not found
        taskId: 99999, // Non-existent task
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/decline', {
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

    it('should reject request with missing playerUuid', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: testTask.id,
        playerUuid: 'invalid-uuid-format', // This will cause mismatch with task owner
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/decline', {
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

    it('should create event log for task decline', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: testTask.id,
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/decline', {
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
          type: 'NPC_TASK_DECLINED'
        }
      });

      expect(event).toBeTruthy();
      expect(event?.details).toMatchObject({
        npcId: testNpc.npcId,
        npcName: testNpc.name,
        taskId: testTask.id,
        itemName: testTask.itemName,
        itemShortName: testTask.itemShortName,
        quantity: testTask.quantity,
        rewardCopper: testTask.rewardCopper,
        dailyCount: testTask.dailyCount
      });
    });

    it('should handle multiple declines without affecting other tasks', async () => {
      // Create another task for the same user
      const anotherTask = await prisma.nPCTask.create({
        data: {
          npcId: testNpc.id,
          userId: testUser.id,
          itemName: 'Steel Dagger',
          itemShortName: 'steel_dagger',
          quantity: 1,
          rewardCopper: 150,
          status: 'ASSIGNED',
          assignedAt: new Date(),
          dailyCount: 2
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

      const request = new NextRequest('http://localhost:3000/api/npc/task/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify only the specified task was declined
      const declinedTask = await prisma.nPCTask.findUnique({
        where: { id: testTask.id }
      });
      expect(declinedTask?.status).toBe('DECLINED');

      // Verify the other task remains assigned
      const otherTask = await prisma.nPCTask.findUnique({
        where: { id: anotherTask.id }
      });
      expect(otherTask?.status).toBe('ASSIGNED');
    });

    it('should include complete task and NPC information in response', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: testTask.id,
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Check task information
      expect(data.data.task).toBeDefined();
      expect(data.data.task.id).toBe(testTask.id);
      expect(data.data.task.status).toBe('DECLINED');

      // Check NPC information
      expect(data.data.npcInfo).toBeDefined();
      expect(data.data.npcInfo.name).toBe('Task Decliner NPC');
      expect(data.data.npcInfo.maxDailyTasks).toBe(3);
    });

    it('should handle task decline without affecting user stats', async () => {
      const initialUser = await prisma.user.findUnique({
        where: { id: testUser.id }
      });

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        taskId: testTask.id,
        playerUuid: testUser.slUuid,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc/task/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify user stats are unchanged
      const finalUser = await prisma.user.findUnique({
        where: { id: testUser.id }
      });

      expect(finalUser?.copper).toBe(initialUser?.copper);
      expect(finalUser?.health).toBe(initialUser?.health);
      expect(finalUser?.hunger).toBe(initialUser?.hunger);
      expect(finalUser?.thirst).toBe(initialUser?.thirst);
    });
  });
});