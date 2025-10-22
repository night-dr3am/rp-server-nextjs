import { POST } from '../route';
import {
  createMockPostRequest,
  cleanupDatabase,
  parseJsonResponse,
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { prisma } from '@/lib/prisma';
import { generateSignature } from '@/lib/signature';

describe('/api/arkana/world-object', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  describe('POST - Upsert World Object', () => {
    it('should create new world object successfully', async () => {
      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const objectData = {
        objectId: 'DOOR_001',
        universe: 'arkana',
        name: 'Secure Vault Door',
        description: 'A heavy reinforced door',
        location: 'Arkana City Vault',
        type: 'door',
        state: 'locked',
        stats: {},
        groups: [],
        actions: [
          {
            id: 'unlock_door',
            label: 'Unlock Door',
            showState: 'locked',
            targetState: 'unlocked',
            description: 'Attempt to unlock the door'
          },
          {
            id: 'lock_door',
            label: 'Lock Door',
            showState: 'unlocked',
            targetState: 'locked',
            description: 'Lock the door securely'
          }
        ],
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/world-object', objectData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(response.status).toBe(200);
      expect(data.data.objectId).toBe('DOOR_001');
      expect(data.data.universe).toBe('arkana');
      expect(data.data.name).toBe('Secure Vault Door');
      expect(data.data.description).toBe('A heavy reinforced door');
      expect(data.data.type).toBe('door');
      expect(data.data.state).toBe('locked');
      expect(data.data.actions).toHaveLength(2);
      expect(data.data.actions[0].id).toBe('unlock_door');

      // Verify object was created in database
      const dbObject = await prisma.worldObject.findUnique({
        where: {
          objectId_universe: {
            objectId: 'DOOR_001',
            universe: 'arkana'
          }
        }
      });
      expect(dbObject).toBeDefined();
      expect(dbObject!.name).toBe('Secure Vault Door');
      expect(dbObject!.state).toBe('locked');
    });

    it('should update existing world object successfully (upsert)', async () => {
      // First create an object
      await prisma.worldObject.create({
        data: {
          objectId: 'CHEST_001',
          universe: 'arkana',
          name: 'Old Chest',
          type: 'chest',
          state: 'locked',
          actions: [
            {
              id: 'old_action',
              label: 'Old Action',
              showState: 'locked'
            }
          ]
        }
      });

      // Now update it via upsert
      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const updateData = {
        objectId: 'CHEST_001',
        universe: 'arkana',
        name: 'Updated Treasure Chest',
        description: 'A chest full of treasures',
        type: 'chest',
        state: 'unlocked',
        stats: { durability: 100 },
        groups: ['admin'],
        actions: [
          {
            id: 'open_chest',
            label: 'Open Chest',
            showState: 'unlocked',
            targetState: 'open',
            description: 'Open the chest'
          }
        ],
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/world-object', updateData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Treasure Chest');
      expect(data.data.description).toBe('A chest full of treasures');
      expect(data.data.state).toBe('unlocked');
      expect(data.data.stats).toEqual({ durability: 100 });
      expect(data.data.groups).toEqual(['admin']);
      expect(data.data.actions).toHaveLength(1);
      expect(data.data.actions[0].id).toBe('open_chest');

      // Verify database was updated
      const dbObject = await prisma.worldObject.findUnique({
        where: {
          objectId_universe: {
            objectId: 'CHEST_001',
            universe: 'arkana'
          }
        }
      });
      expect(dbObject!.name).toBe('Updated Treasure Chest');
      expect(dbObject!.state).toBe('unlocked');
    });

    it('should handle multiple actions with different showStates', async () => {
      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const objectData = {
        objectId: 'LEVER_001',
        universe: 'arkana',
        name: 'Power Lever',
        type: 'lever',
        state: 'off',
        actions: [
          {
            id: 'flip_on',
            label: 'Flip On',
            showState: 'off',
            targetState: 'on'
          },
          {
            id: 'flip_off',
            label: 'Flip Off',
            showState: 'on',
            targetState: 'off'
          },
          {
            id: 'inspect',
            label: 'Inspect',
            showState: 'off',
            description: 'Inspect the lever'
          },
          {
            id: 'repair',
            label: 'Repair',
            showState: 'broken',
            targetState: 'off'
          }
        ],
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/world-object', objectData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.actions).toHaveLength(4);
    });

    it('should reject invalid signature', async () => {
      const timestamp = new Date().toISOString();

      const objectData = {
        objectId: 'DOOR_SIG_TEST',
        universe: 'arkana',
        name: 'Test Door',
        type: 'door',
        actions: [{ id: 'test', label: 'Test', showState: 'default' }],
        timestamp,
        signature: '0000000000000000000000000000000000000000000000000000000000000000' // Valid format, wrong value
      };

      const request = createMockPostRequest('/api/arkana/world-object', objectData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(false);
      expect(response.status).toBe(401);
    });

    it('should reject missing required fields', async () => {
      const timestamp = new Date().toISOString();

      const objectData = {
        universe: 'arkana',
        name: 'Test Door',
        // Missing objectId, type, actions
        timestamp,
        signature: 'test'
      };

      const request = createMockPostRequest('/api/arkana/world-object', objectData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should require at least one action', async () => {
      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const objectData = {
        objectId: 'DOOR_001',
        universe: 'arkana',
        name: 'Test Door',
        type: 'door',
        actions: [], // Empty actions array should fail
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/world-object', objectData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should use default values for optional fields', async () => {
      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const objectData = {
        objectId: 'SIMPLE_001',
        universe: 'arkana',
        name: 'Simple Object',
        type: 'misc',
        // No description, location, owner, state, stats, groups
        actions: [
          {
            id: 'use',
            label: 'Use',
            showState: 'default'
          }
        ],
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/world-object', objectData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.state).toBe('default'); // Default state
      expect(data.data.stats).toEqual({}); // Default empty object
      expect(data.data.groups).toEqual([]); // Default empty array
      expect(data.data.description).toBeNull();
      expect(data.data.location).toBeNull();
      expect(data.data.owner).toBeNull();
    });
  });
});
