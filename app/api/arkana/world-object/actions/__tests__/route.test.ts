import { POST } from '../route';
import {
  createMockPostRequest,
  cleanupDatabase,
  createTestUser,
  ARKANA_TEST_USERS,
  parseJsonResponse,
  testExpectedError,
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { prisma } from '@/lib/prisma';
import { generateSignature } from '@/lib/signature';

describe('/api/arkana/world-object/actions', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  // Helper to create request data with signature
  function createActionsRequest(objectId: string, playerUuid: string) {
    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'arkana');
    return {
      objectId,
      playerUuid,
      universe: 'arkana',
      timestamp,
      signature
    };
  }

  describe('POST - Get Available Actions (State Filtering)', () => {
    it('should return only unlock_door when state is "locked"', async () => {
      // Create test player
      const player = await createTestUser(ARKANA_TEST_USERS[0]); // Arkana user

      // Create world object with state="locked"
      await prisma.worldObject.create({
        data: {
          objectId: 'DOOR_001',
          universe: 'arkana',
          name: 'Secure Vault Door',
          type: 'door',
          state: 'locked', // Current state
          actions: [
            {
              id: 'unlock_door',
              label: 'Unlock Door',
              showState: 'locked', // Matches current state
              targetState: 'unlocked',
              description: 'Attempt to unlock the door'
            },
            {
              id: 'lock_door',
              label: 'Lock Door',
              showState: 'unlocked', // Does NOT match
              targetState: 'locked',
              description: 'Lock the door securely'
            },
            {
              id: 'open_door',
              label: 'Open Door',
              showState: 'unlocked', // Does NOT match
              targetState: 'open',
              description: 'Open the unlocked door'
            }
          ]
        }
      });

      const requestData = createActionsRequest('DOOR_001', player.slUuid);

      const request = createMockPostRequest('/api/arkana/world-object/actions', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(response.status).toBe(200);
      expect(data.data.objectId).toBe('DOOR_001');
      expect(data.data.objectName).toBe('Secure Vault Door');
      expect(data.data.currentState).toBe('locked');

      // CRITICAL: Should only return unlock_door
      expect(data.data.actions).toHaveLength(1);
      expect(data.data.actions[0].id).toBe('unlock_door');
      expect(data.data.actions[0].label).toBe('Unlock Door');
      expect(data.data.actions[0].description).toBe('Attempt to unlock the door');
    });

    it('should return lock_door AND open_door when state is "unlocked"', async () => {
      const player = await createTestUser(ARKANA_TEST_USERS[0]);

      await prisma.worldObject.create({
        data: {
          objectId: 'DOOR_002',
          universe: 'arkana',
          name: 'Simple Door',
          type: 'door',
          state: 'unlocked', // Current state
          actions: [
            {
              id: 'unlock_door',
              label: 'Unlock Door',
              showState: 'locked' // Does NOT match
            },
            {
              id: 'lock_door',
              label: 'Lock Door',
              showState: 'unlocked', // Matches
              targetState: 'locked'
            },
            {
              id: 'open_door',
              label: 'Open Door',
              showState: 'unlocked', // Matches
              targetState: 'open'
            },
            {
              id: 'close_door',
              label: 'Close Door',
              showState: 'open' // Does NOT match
            }
          ]
        }
      });

      const requestData = createActionsRequest('DOOR_002', player.slUuid);

      const request = createMockPostRequest('/api/arkana/world-object/actions', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.currentState).toBe('unlocked');

      // Should return 2 actions: lock_door and open_door
      expect(data.data.actions).toHaveLength(2);
      expect(data.data.actions.map((a: { id: string }) => a.id).sort()).toEqual(['lock_door', 'open_door'].sort());
    });

    it('should return only close_door when state is "open"', async () => {
      const player = await createTestUser(ARKANA_TEST_USERS[0]);

      await prisma.worldObject.create({
        data: {
          objectId: 'DOOR_003',
          universe: 'arkana',
          name: 'Open Door',
          type: 'door',
          state: 'open', // Current state
          actions: [
            {
              id: 'unlock_door',
              label: 'Unlock',
              showState: 'locked'
            },
            {
              id: 'lock_door',
              label: 'Lock',
              showState: 'unlocked'
            },
            {
              id: 'open_door',
              label: 'Open',
              showState: 'unlocked'
            },
            {
              id: 'close_door',
              label: 'Close Door',
              showState: 'open', // Only this matches
              description: 'Close the door'
            }
          ]
        }
      });

      const requestData = createActionsRequest('DOOR_003', player.slUuid);

      const request = createMockPostRequest('/api/arkana/world-object/actions', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.currentState).toBe('open');
      expect(data.data.actions).toHaveLength(1);
      expect(data.data.actions[0].id).toBe('close_door');
    });

    it('should return empty array if no actions match current state', async () => {
      const player = await createTestUser(ARKANA_TEST_USERS[0]);

      await prisma.worldObject.create({
        data: {
          objectId: 'BROKEN_001',
          universe: 'arkana',
          name: 'Broken Object',
          type: 'misc',
          state: 'broken', // Current state
          actions: [
            {
              id: 'use',
              label: 'Use',
              showState: 'working' // Does NOT match
            },
            {
              id: 'activate',
              label: 'Activate',
              showState: 'off' // Does NOT match
            }
          ]
        }
      });

      const requestData = createActionsRequest('BROKEN_001', player.slUuid);

      const request = createMockPostRequest('/api/arkana/world-object/actions', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.currentState).toBe('broken');
      expect(data.data.actions).toHaveLength(0); // No matching actions
      expect(data.data.actions).toEqual([]);
    });

    it('should return all actions when multiple have same showState', async () => {
      const player = await createTestUser(ARKANA_TEST_USERS[0]);

      await prisma.worldObject.create({
        data: {
          objectId: 'CHEST_001',
          universe: 'arkana',
          name: 'Treasure Chest',
          type: 'chest',
          state: 'open', // Current state
          actions: [
            {
              id: 'loot',
              label: 'Loot Chest',
              showState: 'open', // Matches
              description: 'Take items from chest'
            },
            {
              id: 'inspect',
              label: 'Inspect Contents',
              showState: 'open', // Also matches
              description: 'Look inside the chest'
            },
            {
              id: 'close',
              label: 'Close Chest',
              showState: 'open', // Also matches
              targetState: 'closed'
            },
            {
              id: 'unlock',
              label: 'Unlock',
              showState: 'locked' // Does NOT match
            }
          ]
        }
      });

      const requestData = createActionsRequest('CHEST_001', player.slUuid);

      const request = createMockPostRequest('/api/arkana/world-object/actions', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.currentState).toBe('open');

      // Should return all 3 actions with showState="open"
      expect(data.data.actions).toHaveLength(3);
      expect(data.data.actions.map((a: { id: string }) => a.id).sort()).toEqual(['close', 'inspect', 'loot'].sort());
    });

    it('should handle lever with on/off states', async () => {
      const player = await createTestUser(ARKANA_TEST_USERS[0]);

      await prisma.worldObject.create({
        data: {
          objectId: 'LEVER_001',
          universe: 'arkana',
          name: 'Power Lever',
          type: 'lever',
          state: 'off', // Current state
          actions: [
            {
              id: 'flip_on',
              label: 'Flip On',
              showState: 'off', // Matches
              targetState: 'on'
            },
            {
              id: 'flip_off',
              label: 'Flip Off',
              showState: 'on', // Does NOT match
              targetState: 'off'
            }
          ]
        }
      });

      let requestData = createActionsRequest('LEVER_001', player.slUuid);

      let request = createMockPostRequest('/api/arkana/world-object/actions', requestData);
      let response = await POST(request);
      let data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.currentState).toBe('off');
      expect(data.data.actions).toHaveLength(1);
      expect(data.data.actions[0].id).toBe('flip_on');

      // Now change state to "on" and test again
      await prisma.worldObject.update({
        where: {
          objectId_universe: {
            objectId: 'LEVER_001',
            universe: 'arkana'
          }
        },
        data: { state: 'on' }
      });

      requestData = createActionsRequest('LEVER_001', player.slUuid);

      request = createMockPostRequest('/api/arkana/world-object/actions', requestData);
      response = await POST(request);
      data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.currentState).toBe('on');
      expect(data.data.actions).toHaveLength(1);
      expect(data.data.actions[0].id).toBe('flip_off');
    });

    it('should return 404 if world object not found', async () => {
      const player = await createTestUser(ARKANA_TEST_USERS[0]);

      const requestData = createActionsRequest('NONEXISTENT', player.slUuid);

      await testExpectedError(
        'World object not found',
        async () => {
          const response = await POST(createMockPostRequest('/api/arkana/world-object/actions', requestData));
          const data = await parseJsonResponse(response);
          expect(data.success).toBe(false);
          expect(response.status).toBe(404);
          expect(data.error).toContain('World object not found');
        }
      );
    });

    it('should return 404 if player not found', async () => {
      await prisma.worldObject.create({
        data: {
          objectId: 'DOOR_PLAYER_TEST',
          universe: 'arkana',
          name: 'Test Door',
          type: 'door',
          state: 'locked',
          actions: [{ id: 'unlock', label: 'Unlock', showState: 'locked' }]
        }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        objectId: 'DOOR_PLAYER_TEST',
        playerUuid: '00000000-0000-0000-0000-000000000000', // Non-existent player
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/world-object/actions', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(false);
      expect(response.status).toBe(404);
      expect(data.error).toContain('Player not found');
    });

    it('should reject invalid signature', async () => {
      const player = await createTestUser(ARKANA_TEST_USERS[0]);

      await prisma.worldObject.create({
        data: {
          objectId: 'DOOR_SIG_TEST',
          universe: 'arkana',
          name: 'Test Door',
          type: 'door',
          state: 'locked',
          actions: [{ id: 'unlock', label: 'Unlock', showState: 'locked' }]
        }
      });

      const timestamp = new Date().toISOString();

      const requestData = {
        objectId: 'DOOR_SIG_TEST',
        playerUuid: player.slUuid,
        universe: 'arkana',
        timestamp,
        signature: '0000000000000000000000000000000000000000000000000000000000000000' // Valid format, wrong value
      };

      const request = createMockPostRequest('/api/arkana/world-object/actions', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(false);
      expect(response.status).toBe(401);
      expect(data.error).toContain('signature' || 'Unauthorized');
    });

    it('should reject missing required fields', async () => {
      const timestamp = new Date().toISOString();

      const requestData = {
        universe: 'arkana',
        // Missing objectId and playerUuid
        timestamp,
        signature: 'test'
      };

      const request = createMockPostRequest('/api/arkana/world-object/actions', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should not include action fields other than id, label, description', async () => {
      const player = await createTestUser(ARKANA_TEST_USERS[0]);

      await prisma.worldObject.create({
        data: {
          objectId: 'DOOR_FIELDS_TEST',
          universe: 'arkana',
          name: 'Test Door',
          type: 'door',
          state: 'locked',
          actions: [
            {
              id: 'unlock',
              label: 'Unlock Door',
              showState: 'locked',
              targetState: 'unlocked',
              description: 'Attempt to unlock',
              requiresStat: { perception: 3 },
              requiredGroup: 'admin'
            }
          ]
        }
      });

      const requestData = createActionsRequest('DOOR_FIELDS_TEST', player.slUuid);

      const request = createMockPostRequest('/api/arkana/world-object/actions', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.actions).toHaveLength(1);

      // Should only have id, label, description
      const action = data.data.actions[0];
      expect(action.id).toBe('unlock');
      expect(action.label).toBe('Unlock Door');
      expect(action.description).toBe('Attempt to unlock');
      expect(action.showState).toBeUndefined();
      expect(action.targetState).toBeUndefined();
      expect(action.requiresStat).toBeUndefined();
      expect(action.requiredGroup).toBeUndefined();
    });
  });
});
