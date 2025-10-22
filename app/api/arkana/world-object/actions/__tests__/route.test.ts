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
              action: 'Unlock Door',
              showStates: 'locked', // Matches current state
              successState: 'unlocked'
            },
            {
              action: 'Lock Door',
              showStates: 'unlocked', // Does NOT match
              successState: 'locked'
            },
            {
              action: 'Open Door',
              showStates: 'unlocked', // Does NOT match
              successState: 'open'
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

      // CRITICAL: Should only return Unlock Door
      expect(data.data.actions).toHaveLength(1);
      expect(data.data.actions[0].id).toBe('Unlock Door');
      expect(data.data.actions[0].label).toBe('Unlock Door');
      expect(data.data.actions[0].description).toBe('Unlock Door');
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
              action: 'Unlock Door',
              showStates: 'locked', // Does NOT match
              successState: 'unlocked'
            },
            {
              action: 'Lock Door',
              showStates: 'unlocked', // Matches
              successState: 'locked'
            },
            {
              action: 'Open Door',
              showStates: 'unlocked', // Matches
              successState: 'open'
            },
            {
              action: 'Close Door',
              showStates: 'open', // Does NOT match
              successState: 'unlocked'
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

      // Should return 2 actions: Lock Door and Open Door
      expect(data.data.actions).toHaveLength(2);
      expect(data.data.actions.map((a: { id: string }) => a.id).sort()).toEqual(['Lock Door', 'Open Door'].sort());
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
              action: 'Unlock',
              showStates: 'locked',
              successState: 'unlocked'
            },
            {
              action: 'Lock',
              showStates: 'unlocked',
              successState: 'locked'
            },
            {
              action: 'Open',
              showStates: 'unlocked',
              successState: 'open'
            },
            {
              action: 'Close Door',
              showStates: 'open', // Only this matches
              successState: 'closed'
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
      expect(data.data.actions[0].id).toBe('Close Door');
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
              action: 'Use',
              showStates: 'working', // Does NOT match
              successState: 'used'
            },
            {
              action: 'Activate',
              showStates: 'off', // Does NOT match
              successState: 'on'
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
              action: 'Loot Chest',
              showStates: 'open', // Matches
              successState: 'looted'
            },
            {
              action: 'Inspect Contents',
              showStates: 'open', // Also matches
              successState: 'open'
            },
            {
              action: 'Close Chest',
              showStates: 'open', // Also matches
              successState: 'closed'
            },
            {
              action: 'Unlock',
              showStates: 'locked', // Does NOT match
              successState: 'open'
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

      // Should return all 3 actions with showStates="open"
      expect(data.data.actions).toHaveLength(3);
      expect(data.data.actions.map((a: { id: string }) => a.id).sort()).toEqual(['Close Chest', 'Inspect Contents', 'Loot Chest'].sort());
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
              action: 'Flip On',
              showStates: 'off', // Matches
              successState: 'on'
            },
            {
              action: 'Flip Off',
              showStates: 'on', // Does NOT match
              successState: 'off'
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
      expect(data.data.actions[0].id).toBe('Flip On');

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
      expect(data.data.actions[0].id).toBe('Flip Off');
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
          actions: [{ action: 'Unlock', showStates: 'locked', successState: 'unlocked' }]
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
          actions: [{ action: 'Unlock', showStates: 'locked', successState: 'unlocked' }]
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
              action: 'Unlock Door',
              showStates: 'locked',
              successState: 'unlocked'
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

      // Should only have id, label, description (action name used for all)
      const action = data.data.actions[0];
      expect(action.id).toBe('Unlock Door');
      expect(action.label).toBe('Unlock Door');
      expect(action.description).toBe('Unlock Door');
      expect(action.showStates).toBeUndefined();
      expect(action.successState).toBeUndefined();
    });
  });
});
