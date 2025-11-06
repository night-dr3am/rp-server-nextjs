// Tests for Arkana Data Admin API - Single Item Operations
// Tests GET, PUT, DELETE /api/arkana/admin/arkana-data/[id]

import { GET, PUT, DELETE } from '../route';
import {
  createMockGetRequest,
  createMockPutRequest,
  createMockRequest,
  cleanupDatabase,
  expectSuccess,
  expectError,
  parseJsonResponse,
  createTestUser
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { prisma } from '@/lib/prisma';
import { invalidateCache } from '@/lib/arkana/unifiedDataLoader';

describe('Arkana Data Admin API - Single Item', () => {
  let adminToken: string;
  let playerToken: string;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    await prisma.arkanaData.deleteMany({});
    invalidateCache();

    // Create admin user
    const adminResult = await createTestUser('arkana');
    adminToken = adminResult.token;

    await prisma.arkanaStats.create({
      data: {
        userId: adminResult.user.id,
        characterName: 'Admin User',
        agentName: 'AdminAgent',
        race: 'Human',
        archetype: 'Arcanist',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        maxHP: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    // Create player user
    const playerResult = await createTestUser('arkana');
    playerToken = playerResult.token;

    await prisma.arkanaStats.create({
      data: {
        userId: playerResult.user.id,
        characterName: 'Player User',
        agentName: 'PlayerAgent',
        race: 'Human',
        archetype: 'Arcanist',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        maxHP: 15,
        arkanaRole: 'player',
        registrationCompleted: true
      }
    });
  });

  describe('GET /api/arkana/admin/arkana-data/[id]', () => {
    it('should get single item by ID for admin', async () => {
      await prisma.arkanaData.create({
        data: {
          id: 'get_test_flaw',
          type: 'flaw',
          jsonData: {
            name: 'Get Test Flaw',
            desc: 'Test description',
            cost: 2
          }
        }
      });

      const request = createMockGetRequest('/api/arkana/admin/arkana-data/get_test_flaw', {
        token: adminToken
      });

      const context = { params: Promise.resolve({ id: 'get_test_flaw' }) };
      const response = await GET(request, context);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.id).toBe('get_test_flaw');
      expect(data.data.name).toBe('Get Test Flaw');
      expect(data.data.type).toBe('flaw');
    });

    it('should return 404 for non-existent ID', async () => {
      const request = createMockGetRequest('/api/arkana/admin/arkana-data/nonexistent', {
        token: adminToken
      });

      const context = { params: Promise.resolve({ id: 'nonexistent' }) };
      const response = await GET(request, context);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(404);
    });

    it('should deny access to non-admin users', async () => {
      await prisma.arkanaData.create({
        data: {
          id: 'test_flaw',
          type: 'flaw',
          jsonData: { name: 'Test' }
        }
      });

      const request = createMockGetRequest('/api/arkana/admin/arkana-data/test_flaw', {
        token: playerToken
      });

      const context = { params: Promise.resolve({ id: 'test_flaw' }) };
      const response = await GET(request, context);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(403);
    });
  });

  describe('PUT /api/arkana/admin/arkana-data/[id]', () => {
    it('should update item for admin', async () => {
      await prisma.arkanaData.create({
        data: {
          id: 'update_test_flaw',
          type: 'flaw',
          jsonData: {
            name: 'Original Name',
            desc: 'Original Description',
            cost: 2
          }
        }
      });

      const request = createMockPutRequest('/api/arkana/admin/arkana-data/update_test_flaw', {
        token: adminToken,
        jsonData: {
          name: 'Updated Name',
          desc: 'Updated Description',
          cost: 3
        }
      });

      const context = { params: Promise.resolve({ id: 'update_test_flaw' }) };
      const response = await PUT(request, context);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.item.name).toBe('Updated Name');
      expect(data.data.item.cost).toBe(3);

      // Verify in database
      const dbItem = await prisma.arkanaData.findUnique({
        where: { id: 'update_test_flaw' }
      });
      expect((dbItem?.jsonData as Record<string, unknown>).name).toBe('Updated Name');
    });

    it('should return 404 when updating non-existent item', async () => {
      const request = createMockPutRequest('/api/arkana/admin/arkana-data/nonexistent', {
        token: adminToken,
        jsonData: { name: 'Test' }
      });

      const context = { params: Promise.resolve({ id: 'nonexistent' }) };
      const response = await PUT(request, context);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(404);
    });

    it('should deny access to non-admin users', async () => {
      await prisma.arkanaData.create({
        data: {
          id: 'test_flaw',
          type: 'flaw',
          jsonData: { name: 'Test' }
        }
      });

      const request = createMockPutRequest('/api/arkana/admin/arkana-data/test_flaw', {
        token: playerToken,
        jsonData: { name: 'Hacked' }
      });

      const context = { params: Promise.resolve({ id: 'test_flaw' }) };
      const response = await PUT(request, context);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(403);
    });

    it('should invalidate cache after update', async () => {
      await prisma.arkanaData.create({
        data: {
          id: 'cache_update_test',
          type: 'flaw',
          jsonData: { name: 'Original', cost: 1 }
        }
      });

      const request = createMockPutRequest('/api/arkana/admin/arkana-data/cache_update_test', {
        token: adminToken,
        jsonData: { name: 'Updated', cost: 2 }
      });

      const context = { params: Promise.resolve({ id: 'cache_update_test' }) };
      await PUT(request, context);

      // Cache should be invalidated
      const { loadFlaws } = await import('@/lib/arkana/unifiedDataLoader');
      const flaws = await loadFlaws();
      const found = flaws.find((f: Record<string, unknown> & { id: string }) => f.id === 'cache_update_test');
      expect(found?.name).toBe('Updated');
    });
  });

  describe('DELETE /api/arkana/admin/arkana-data/[id]', () => {
    it('should delete item for admin', async () => {
      await prisma.arkanaData.create({
        data: {
          id: 'delete_test_flaw',
          type: 'flaw',
          jsonData: { name: 'To Delete' }
        }
      });

      const request = createMockRequest('DELETE', {}, '/api/arkana/admin/arkana-data/delete_test_flaw', {
        token: adminToken
      });

      const context = { params: Promise.resolve({ id: 'delete_test_flaw' }) };
      const response = await DELETE(request, context);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.deletedId).toBe('delete_test_flaw');

      // Verify deleted from database
      const dbItem = await prisma.arkanaData.findUnique({
        where: { id: 'delete_test_flaw' }
      });
      expect(dbItem).toBeNull();
    });

    it('should return 404 when deleting non-existent item', async () => {
      const request = createMockRequest('DELETE', {}, '/api/arkana/admin/arkana-data/nonexistent', {
        token: adminToken
      });

      const context = { params: Promise.resolve({ id: 'nonexistent' }) };
      const response = await DELETE(request, context);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(404);
    });

    it('should deny access to non-admin users', async () => {
      await prisma.arkanaData.create({
        data: {
          id: 'test_flaw',
          type: 'flaw',
          jsonData: { name: 'Test' }
        }
      });

      const request = createMockRequest('DELETE', {}, '/api/arkana/admin/arkana-data/test_flaw', {
        token: playerToken
      });

      const context = { params: Promise.resolve({ id: 'test_flaw' }) };
      const response = await DELETE(request, context);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(403);
    });

    it('should invalidate cache after deletion', async () => {
      await prisma.arkanaData.create({
        data: {
          id: 'cache_delete_test',
          type: 'flaw',
          jsonData: { name: 'To Delete' }
        }
      });

      const request = createMockRequest('DELETE', {}, '/api/arkana/admin/arkana-data/cache_delete_test', {
        token: adminToken
      });

      const context = { params: Promise.resolve({ id: 'cache_delete_test' }) };
      await DELETE(request, context);

      // Cache should be invalidated
      const { loadFlaws } = await import('@/lib/arkana/unifiedDataLoader');
      const flaws = await loadFlaws();
      const found = flaws.find((f: Record<string, unknown> & { id: string }) => f.id === 'cache_delete_test');
      expect(found).toBeUndefined();
    });
  });
});
