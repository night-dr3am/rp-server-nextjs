import { POST } from '../route';
import {
  createMockPostRequest,
  cleanupDatabase,
  parseJsonResponse,
  testExpectedError,
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { prisma } from '@/lib/prisma';
import { generateSignature } from '@/lib/signature';

describe('/api/arkana/world-object/sync', () => {
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
  function createSyncRequest(objectId: string) {
    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'arkana');
    return {
      objectId,
      universe: 'arkana',
      timestamp,
      signature
    };
  }

  describe('POST - Sync World Object State', () => {
    it('should return current state for existing object', async () => {
      // Create world object with state="locked"
      await prisma.worldObject.create({
        data: {
          objectId: 'DOOR_SYNC_001',
          universe: 'arkana',
          name: 'Secure Vault Door',
          type: 'door',
          state: 'locked',
          actions: [
            {
              action: 'Unlock',
              showStates: 'locked',
              successState: 'unlocked'
            }
          ]
        }
      });

      const requestData = createSyncRequest('DOOR_SYNC_001');

      const request = createMockPostRequest('/api/arkana/world-object/sync', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(response.status).toBe(200);
      expect(data.data.objectId).toBe('DOOR_SYNC_001');
      expect(data.data.state).toBe('locked');
      expect(data.data.name).toBe('Secure Vault Door');

      // Should NOT return other fields (actions, owners, etc.)
      expect(data.data.actions).toBeUndefined();
      expect(data.data.owners).toBeUndefined();
      expect(data.data.type).toBeUndefined();
    });

    it('should return updated state after state change', async () => {
      // Create object
      await prisma.worldObject.create({
        data: {
          objectId: 'DOOR_SYNC_002',
          universe: 'arkana',
          name: 'Test Door',
          type: 'door',
          state: 'locked',
          actions: [
            {
              action: 'Unlock',
              showStates: 'locked',
              successState: 'unlocked'
            }
          ]
        }
      });

      // First sync - state should be "locked"
      let requestData = createSyncRequest('DOOR_SYNC_002');
      let request = createMockPostRequest('/api/arkana/world-object/sync', requestData);
      let response = await POST(request);
      let data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.state).toBe('locked');

      // Update state in database
      await prisma.worldObject.update({
        where: {
          objectId_universe: {
            objectId: 'DOOR_SYNC_002',
            universe: 'arkana'
          }
        },
        data: { state: 'unlocked' }
      });

      // Second sync - state should now be "unlocked"
      requestData = createSyncRequest('DOOR_SYNC_002');
      request = createMockPostRequest('/api/arkana/world-object/sync', requestData);
      response = await POST(request);
      data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.state).toBe('unlocked');
    });

    it('should handle different object types and states', async () => {
      // Create lever with "on" state
      await prisma.worldObject.create({
        data: {
          objectId: 'LEVER_SYNC_001',
          universe: 'arkana',
          name: 'Power Lever',
          type: 'lever',
          state: 'on',
          actions: [
            {
              action: 'Flip Off',
              showStates: 'on',
              successState: 'off'
            }
          ]
        }
      });

      const requestData = createSyncRequest('LEVER_SYNC_001');
      const request = createMockPostRequest('/api/arkana/world-object/sync', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.objectId).toBe('LEVER_SYNC_001');
      expect(data.data.state).toBe('on');
      expect(data.data.name).toBe('Power Lever');
    });

    it('should return 404 if object not found', async () => {
      const requestData = createSyncRequest('NONEXISTENT_OBJECT');

      await testExpectedError(
        'World object not found',
        async () => {
          const response = await POST(createMockPostRequest('/api/arkana/world-object/sync', requestData));
          const data = await parseJsonResponse(response);
          expect(data.success).toBe(false);
          expect(response.status).toBe(404);
          expect(data.error).toContain('World object not found');
        }
      );
    });

    it('should reject invalid signature', async () => {
      await prisma.worldObject.create({
        data: {
          objectId: 'DOOR_SIG_SYNC',
          universe: 'arkana',
          name: 'Test Door',
          type: 'door',
          state: 'locked',
          actions: [
            {
              action: 'Unlock',
              showStates: 'locked',
              successState: 'unlocked'
            }
          ]
        }
      });

      const timestamp = new Date().toISOString();

      const requestData = {
        objectId: 'DOOR_SIG_SYNC',
        universe: 'arkana',
        timestamp,
        signature: '0000000000000000000000000000000000000000000000000000000000000000' // Valid format, wrong value
      };

      const request = createMockPostRequest('/api/arkana/world-object/sync', requestData);
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
        // Missing objectId
        timestamp,
        signature: 'test'
      };

      const request = createMockPostRequest('/api/arkana/world-object/sync', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should handle objects with default state', async () => {
      await prisma.worldObject.create({
        data: {
          objectId: 'DEFAULT_STATE_TEST',
          universe: 'arkana',
          name: 'Test Object',
          type: 'misc',
          state: 'default', // Default state
          actions: [
            {
              action: 'Use',
              showStates: 'default',
              successState: 'used'
            }
          ]
        }
      });

      const requestData = createSyncRequest('DEFAULT_STATE_TEST');
      const request = createMockPostRequest('/api/arkana/world-object/sync', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.state).toBe('default');
    });
  });
});
