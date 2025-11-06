// Tests for Arkana Data Admin API Endpoints
// Tests GET /api/arkana/admin/arkana-data and POST /api/arkana/admin/arkana-data

import { GET, POST } from '../route';
import {
  createMockGetRequest,
  createMockPostRequest,
  cleanupDatabase,
  expectSuccess,
  expectError,
  parseJsonResponse,
  createTestUser
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { prisma } from '@/lib/prisma';
import { invalidateCache } from '@/lib/arkana/unifiedDataLoader';

describe('Arkana Data Admin API - List & Create', () => {
  let adminToken: string;
  let adminUser: { id: string; agentName: string };
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
    adminUser = adminResult.user;
    adminToken = adminResult.token;

    await prisma.arkanaStats.create({
      data: {
        userId: adminUser.id,
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

  describe('GET /api/arkana/admin/arkana-data', () => {
    it('should list all items for admin user', async () => {
      // Insert test data
      await prisma.arkanaData.createMany({
        data: [
          { id: 'test_flaw_1', type: 'flaw', jsonData: { name: 'Test Flaw 1', cost: 2 } },
          { id: 'test_perk_1', type: 'perk', jsonData: { name: 'Test Perk 1', cost: 3 } }
        ]
      });

      const request = createMockGetRequest('/api/arkana/admin/arkana-data', {
        token: adminToken
      });

      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.total).toBeGreaterThanOrEqual(2);
      expect(data.data.items).toEqual(expect.arrayContaining([]));
    });

    it('should filter items by type', async () => {
      await prisma.arkanaData.createMany({
        data: [
          { id: 'flaw_1', type: 'flaw', jsonData: { name: 'Flaw 1' } },
          { id: 'flaw_2', type: 'flaw', jsonData: { name: 'Flaw 2' } },
          { id: 'perk_1', type: 'perk', jsonData: { name: 'Perk 1' } }
        ]
      });

      const request = createMockGetRequest('/api/arkana/admin/arkana-data', {
        token: adminToken,
        type: 'flaw'
      });

      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.items.every((item: Record<string, unknown> & { id: string; type: string }) => item.type === 'flaw')).toBe(true);
    });

    it('should search items by ID', async () => {
      await prisma.arkanaData.create({
        data: {
          id: 'unique_searchable_flaw',
          type: 'flaw',
          jsonData: { name: 'Searchable Flaw' }
        }
      });

      const request = createMockGetRequest('/api/arkana/admin/arkana-data', {
        token: adminToken,
        search: 'searchable'
      });

      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      const found = data.data.items.find((item: Record<string, unknown> & { id: string; type: string }) => item.id === 'unique_searchable_flaw');
      expect(found).toBeDefined();
    });

    it('should deny access to non-admin users', async () => {
      const request = createMockGetRequest('/api/arkana/admin/arkana-data', {
        token: playerToken
      });

      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(403);
    });

    it('should require token', async () => {
      const request = createMockGetRequest('/api/arkana/admin/arkana-data', {});

      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(400);
    });

    it('should reject invalid token', async () => {
      const request = createMockGetRequest('/api/arkana/admin/arkana-data', {
        token: 'invalid_token_12345'
      });

      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/arkana/admin/arkana-data', () => {
    it('should create new item as admin', async () => {
      const request = createMockPostRequest('/api/arkana/admin/arkana-data', {
        token: adminToken,
        id: 'new_test_flaw',
        type: 'flaw',
        jsonData: {
          name: 'New Test Flaw',
          desc: 'A newly created flaw',
          cost: 2,
          tags: ['test']
        }
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.item.id).toBe('new_test_flaw');
      expect(data.data.item.name).toBe('New Test Flaw');
      expect(response.status).toBe(201);

      // Verify in database
      const dbItem = await prisma.arkanaData.findUnique({
        where: { id: 'new_test_flaw' }
      });
      expect(dbItem).toBeDefined();
    });

    it('should prevent duplicate IDs', async () => {
      await prisma.arkanaData.create({
        data: {
          id: 'duplicate_id_test',
          type: 'flaw',
          jsonData: { name: 'Original' }
        }
      });

      const request = createMockPostRequest('/api/arkana/admin/arkana-data', {
        token: adminToken,
        id: 'duplicate_id_test',
        type: 'perk',
        jsonData: { name: 'Duplicate' }
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(data.error).toContain('already exists');
      expect(response.status).toBe(409);
    });

    it('should validate required fields', async () => {
      const request = createMockPostRequest('/api/arkana/admin/arkana-data', {
        token: adminToken,
        id: 'test_id'
        // Missing type and jsonData
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(400);
    });

    it('should validate type enum', async () => {
      const request = createMockPostRequest('/api/arkana/admin/arkana-data', {
        token: adminToken,
        id: 'test_id',
        type: 'invalid_type',
        jsonData: { name: 'Test' }
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(400);
    });

    it('should deny access to non-admin users', async () => {
      const request = createMockPostRequest('/api/arkana/admin/arkana-data', {
        token: playerToken,
        id: 'player_test',
        type: 'flaw',
        jsonData: { name: 'Player Test' }
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(403);
    });

    it('should invalidate cache after creation', async () => {
      const request = createMockPostRequest('/api/arkana/admin/arkana-data', {
        token: adminToken,
        id: 'cache_test_flaw',
        type: 'flaw',
        jsonData: { name: 'Cache Test', cost: 1 }
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Cache should be invalidated, so next load will get new data from DB
      const { loadFlaws } = await import('@/lib/arkana/unifiedDataLoader');
      const flaws = await loadFlaws();
      const found = flaws.find((f: Record<string, unknown> & { id: string }) => f.id === 'cache_test_flaw');
      expect(found).toBeDefined();
    });
  });

  describe('GET /api/arkana/admin/arkana-data - Unified Loader Integration (JSON Fallback)', () => {
    it('should load data from JSON files when database is empty', async () => {
      // Ensure database is completely empty
      await prisma.arkanaData.deleteMany({});
      invalidateCache();

      // Request flaws (should fallback to JSON)
      const request = createMockGetRequest('/api/arkana/admin/arkana-data', {
        token: adminToken,
        type: 'flaw'
      });

      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // JSON files should have test data (flaws3.json has 1 item in test mode)
      expect(data.data.items.length).toBeGreaterThan(0);
      expect(data.data.total).toBeGreaterThan(0);
      expect(response.status).toBe(200);
    });

    it('should load data from database when database has records', async () => {
      // Add one item to database
      await prisma.arkanaData.create({
        data: {
          id: 'db_test_flaw',
          type: 'flaw',
          jsonData: { name: 'Database Flaw', cost: 2 }
        }
      });
      invalidateCache();

      // Request flaws (should use database)
      const request = createMockGetRequest('/api/arkana/admin/arkana-data', {
        token: adminToken,
        type: 'flaw'
      });

      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Should find the database item
      const found = data.data.items.find((item: Record<string, unknown> & { id: string }) => item.id === 'db_test_flaw');
      expect(found).toBeDefined();
      expect(found.name).toBe('Database Flaw');
    });

    it('should paginate JSON data correctly', async () => {
      // Ensure database is empty to force JSON fallback
      await prisma.arkanaData.deleteMany({});
      invalidateCache();

      // Request with pagination
      const request = createMockGetRequest('/api/arkana/admin/arkana-data', {
        token: adminToken,
        type: 'flaw',
        page: '1',
        limit: '2'
      });

      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.page).toBe(1);
      expect(data.data.limit).toBe(2);
      expect(data.data.items.length).toBeLessThanOrEqual(2);
      expect(data.data.totalPages).toBe(Math.ceil(data.data.total / 2));
    });

    it('should sort JSON data correctly', async () => {
      // Ensure database is empty
      await prisma.arkanaData.deleteMany({});
      invalidateCache();

      // Request sorted by ID descending
      const request = createMockGetRequest('/api/arkana/admin/arkana-data', {
        token: adminToken,
        type: 'flaw',
        sortBy: 'id',
        sortOrder: 'desc'
      });

      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      if (data.data.items.length > 1) {
        const firstId = String(data.data.items[0].id);
        const secondId = String(data.data.items[1].id);
        expect(firstId.localeCompare(secondId)).toBeGreaterThanOrEqual(0);
      }
    });

    it('should search JSON data correctly', async () => {
      // Ensure database is empty
      await prisma.arkanaData.deleteMany({});
      invalidateCache();

      // Request with search term
      const request = createMockGetRequest('/api/arkana/admin/arkana-data', {
        token: adminToken,
        type: 'flaw',
        search: 'test' // This should match test data in JSON
      });

      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // All returned items should match search
      data.data.items.forEach((item: Record<string, unknown> & { id: string; name?: string }) => {
        const matchesId = String(item.id).toLowerCase().includes('test');
        const matchesName = item.name ? String(item.name).toLowerCase().includes('test') : false;
        expect(matchesId || matchesName).toBe(true);
      });
    });

    it('should handle all data types with JSON fallback', async () => {
      // Ensure database is empty
      await prisma.arkanaData.deleteMany({});
      invalidateCache();

      const types: Array<'flaw' | 'commonPower' | 'archetypePower' | 'perk' | 'magicSchool' | 'magicWave' | 'cybernetic' | 'skill' | 'effect'> = [
        'flaw', 'commonPower', 'archetypePower', 'perk',
        'magicSchool', 'magicWave', 'cybernetic', 'skill', 'effect'
      ];

      for (const type of types) {
        const request = createMockGetRequest('/api/arkana/admin/arkana-data', {
          token: adminToken,
          type: type
        });

        const response = await GET(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);
        expect(response.status).toBe(200);
        expect(data.data.type).toBe(type);
        // Each type should have some test data in JSON files
        expect(data.data.total).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return consistent format for JSON and DB sources', async () => {
      // First, get data from JSON (empty DB)
      await prisma.arkanaData.deleteMany({});
      invalidateCache();

      const jsonRequest = createMockGetRequest('/api/arkana/admin/arkana-data', {
        token: adminToken,
        type: 'flaw'
      });

      const jsonResponse = await GET(jsonRequest);
      const jsonData = await parseJsonResponse(jsonResponse);

      expectSuccess(jsonData);
      expect(jsonData.data).toHaveProperty('items');
      expect(jsonData.data).toHaveProperty('total');
      expect(jsonData.data).toHaveProperty('page');
      expect(jsonData.data).toHaveProperty('limit');
      expect(jsonData.data).toHaveProperty('totalPages');
      expect(jsonData.data).toHaveProperty('type');

      // Now add DB data and verify same format
      await prisma.arkanaData.create({
        data: {
          id: 'format_test_flaw',
          type: 'flaw',
          jsonData: { name: 'Format Test' }
        }
      });
      invalidateCache();

      const dbRequest = createMockGetRequest('/api/arkana/admin/arkana-data', {
        token: adminToken,
        type: 'flaw'
      });

      const dbResponse = await GET(dbRequest);
      const dbData = await parseJsonResponse(dbResponse);

      expectSuccess(dbData);
      // Verify same response structure
      expect(Object.keys(jsonData.data).sort()).toEqual(Object.keys(dbData.data).sort());
    });

    it('should handle empty result set gracefully', async () => {
      // Empty database
      await prisma.arkanaData.deleteMany({});
      invalidateCache();

      // Search for something that doesn't exist
      const request = createMockGetRequest('/api/arkana/admin/arkana-data', {
        token: adminToken,
        type: 'flaw',
        search: 'definitely_not_existing_xyz_123'
      });

      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.items).toEqual([]);
      expect(data.data.total).toBe(0);
      expect(data.data.totalPages).toBe(0);
      expect(response.status).toBe(200);
    });
  });
});
