import { NextRequest } from 'next/server';
import { POST, GET } from '../route';
import { cleanupTestData, createTestSignature } from '@/__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';

// Removed LSL_SECRET_KEY as we now use universe-based signatures

describe('/api/npc', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('POST - NPC Registration', () => {
    it('should register a new NPC successfully', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        npcId: 'test-npc-001',
        universe: 'Gor',
        name: 'Test Blacksmith',
        description: 'A skilled blacksmith who forges weapons and tools',
        location: 'Market Square',
        maxDailyTasks: 5,
        taskInterval: 300,
        resetHour: 6,
        minRewardMult: 3,
        maxRewardMult: 7,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.npcId).toBe('test-npc-001');
      expect(data.data.name).toBe('Test Blacksmith');

      // Verify NPC was created in database
      const npc = await prisma.nPC.findUnique({
        where: {
          npcId_universe: {
            npcId: 'test-npc-001',
            universe: 'Gor'
          }
        }
      });
      expect(npc).toBeTruthy();
      expect(npc?.name).toBe('Test Blacksmith');
    });

    it('should update existing NPC on duplicate registration', async () => {
      // Create initial NPC
      await prisma.nPC.create({
        data: {
          npcId: 'test-npc-002',
          universe: 'Gor',
          name: 'Old Name',
          description: 'Old description',
          location: 'Old location',
          maxDailyTasks: 3,
          taskInterval: 600,
          resetHour: 8,
          minRewardMult: 2,
          maxRewardMult: 5
        }
      });

      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        npcId: 'test-npc-002',
        universe: 'Gor',
        name: 'Updated Blacksmith',
        description: 'Updated description',
        location: 'New Market Square',
        maxDailyTasks: 7,
        taskInterval: 400,
        resetHour: 10,
        minRewardMult: 4,
        maxRewardMult: 8,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Blacksmith');

      // Verify NPC was updated
      const npc = await prisma.nPC.findUnique({
        where: {
          npcId_universe: {
            npcId: 'test-npc-002',
            universe: 'Gor'
          }
        }
      });
      expect(npc?.name).toBe('Updated Blacksmith');
      expect(npc?.maxDailyTasks).toBe(7);
    });

    it('should reject request with invalid signature', async () => {
      const timestamp = new Date().toISOString();
      const invalidSignature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // Valid hex format but wrong signature

      const requestData = {
        npcId: 'test-npc-003',
        universe: 'Gor',
        name: 'Test NPC',
        description: 'Test description',
        location: 'Test location',
        maxDailyTasks: 3,
        taskInterval: 300,
        resetHour: 6,
        minRewardMult: 3,
        maxRewardMult: 7,
        timestamp,
        signature: invalidSignature
      };

      const request = new NextRequest('http://localhost:3000/api/npc', {
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

    it('should reject request with missing required fields', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        // Missing npcId and name
        universe: 'Gor',
        description: 'Test description',
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid NPC data');
    });

    it('should reject request with invalid field values', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const requestData = {
        npcId: '', // Empty npcId
        universe: 'InvalidUniverse',
        name: 'Test NPC',
        description: 'Test description',
        location: 'Test location',
        maxDailyTasks: -1, // Invalid negative value
        taskInterval: 300,
        resetHour: 6,
        minRewardMult: 3,
        maxRewardMult: 7,
        timestamp,
        signature
      };

      const request = new NextRequest('http://localhost:3000/api/npc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid NPC data');
    });
  });

  describe('GET - NPC Listing', () => {
    beforeEach(async () => {
      // Create test NPCs
      await prisma.nPC.createMany({
        data: [
          {
            npcId: 'npc-001',
            universe: 'Gor',
            name: 'Blacksmith',
            description: 'Master blacksmith',
            location: 'Market Square',
            maxDailyTasks: 5,
            taskInterval: 300,
            resetHour: 6,
            minRewardMult: 3,
            maxRewardMult: 7
          },
          {
            npcId: 'npc-002',
            universe: 'Gor',
            name: 'Merchant',
            description: 'Traveling merchant',
            location: 'Trade Post',
            maxDailyTasks: 3,
            taskInterval: 600,
            resetHour: 8,
            minRewardMult: 2,
            maxRewardMult: 5
          },
          {
            npcId: 'npc-003',
            universe: 'Earth',
            name: 'Other Universe NPC',
            description: 'Should not appear in Gor results',
            location: 'Earth Location',
            maxDailyTasks: 1,
            taskInterval: 1200,
            resetHour: 12,
            minRewardMult: 1,
            maxRewardMult: 3
          }
        ]
      });
    });

    it('should list all NPCs for Gor universe', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const url = new URL('http://localhost:3000/api/npc');
      url.searchParams.set('universe', 'Gor');
      url.searchParams.set('timestamp', timestamp);
      url.searchParams.set('signature', signature);

      const request = new NextRequest(url.toString(), {
        method: 'GET'
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);

      const npcIds = data.data.map((npc: { npcId: string }) => npc.npcId);
      expect(npcIds).toContain('npc-001');
      expect(npcIds).toContain('npc-002');
      expect(npcIds).not.toContain('npc-003'); // Different universe
    });

    it('should reject GET request with invalid signature', async () => {
      const timestamp = new Date().toISOString();
      const invalidSignature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // Valid hex format but wrong signature

      const url = new URL('http://localhost:3000/api/npc');
      url.searchParams.set('universe', 'Gor');
      url.searchParams.set('timestamp', timestamp);
      url.searchParams.set('signature', invalidSignature);

      const request = new NextRequest(url.toString(), {
        method: 'GET'
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid signature');
    });

    it('should use default Gor universe when not specified', async () => {
      const timestamp = new Date().toISOString();
      const signature = createTestSignature(timestamp);

      const url = new URL('http://localhost:3000/api/npc');
      url.searchParams.set('timestamp', timestamp);
      url.searchParams.set('signature', signature);

      const request = new NextRequest(url.toString(), {
        method: 'GET'
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2); // Only Gor NPCs
    });
  });
});