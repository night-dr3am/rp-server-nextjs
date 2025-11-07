// Tests for Export Endpoint
// POST /api/arkana/admin/arkana-data/export
// GET /api/arkana/admin/arkana-data/export (stats only)

import { POST, GET } from '../route';
import {
  createMockPostRequest,
  createMockGetRequest,
  cleanupDatabase,
  expectSuccess,
  expectError,
  parseJsonResponse,
  createTestUser
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { prisma } from '@/lib/prisma';
import { invalidateCache } from '@/lib/arkana/unifiedDataLoader';

describe('Arkana Data Export Endpoint', () => {
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

  describe('POST /api/arkana/admin/arkana-data/export', () => {
    it('should export data as JSON file for admin', async () => {
      await prisma.arkanaData.createMany({
        data: [
          { id: 'export_flaw_1', arkanaDataType: 'flaw', jsonData: { name: 'Export Flaw 1', cost: 1 } },
          { id: 'export_flaw_2', arkanaDataType: 'flaw', jsonData: { name: 'Export Flaw 2', cost: 2 } }
        ]
      });

      const request = createMockPostRequest('/api/arkana/admin/arkana-data/export', {
        token: adminToken,
        type: 'flaw'
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(response.headers.get('content-disposition')).toContain('attachment');
      expect(response.headers.get('content-disposition')).toContain('flaws3.json');

      // Parse response body as JSON
      const jsonText = await response.text();
      const exported = JSON.parse(jsonText);

      expect(Array.isArray(exported)).toBe(true);
      const exportedFlaws = exported.filter((item: Record<string, unknown> & { id: string }) => item.id.startsWith('export_flaw'));
      expect(exportedFlaws.length).toBeGreaterThanOrEqual(2);
    });

    it('should export with correct filename for each type', async () => {
      const typeFilenameMap = [
        { type: 'flaw', filename: 'flaws3.json' },
        { type: 'commonPower', filename: 'common_powers2.json' },
        { type: 'perk', filename: 'perks2.json' },
        { type: 'skill', filename: 'skills.json' },
        { type: 'effect', filename: 'effects.json' }
      ];

      for (const { type, filename } of typeFilenameMap) {
        const request = createMockPostRequest('/api/arkana/admin/arkana-data/export', {
          token: adminToken,
          type
        });

        const response = await POST(request);
        const contentDisposition = response.headers.get('content-disposition');

        expect(contentDisposition).toContain(filename);
      }
    });

    it('should export magic schools and weaves to same file', async () => {
      await prisma.arkanaData.createMany({
        data: [
          { id: 'school_test', arkanaDataType: 'magicSchool', jsonData: { name: 'Test School' } },
          { id: 'test_weave', arkanaDataType: 'magicWave', jsonData: { name: 'Test Weave' } }
        ]
      });

      const schoolRequest = createMockPostRequest('/api/arkana/admin/arkana-data/export', {
        token: adminToken,
        type: 'magicSchool'
      });

      const schoolResponse = await POST(schoolRequest);
      expect(schoolResponse.headers.get('content-disposition')).toContain('magic_schools8.json');

      const weaveRequest = createMockPostRequest('/api/arkana/admin/arkana-data/export', {
        token: adminToken,
        type: 'magicWave'
      });

      const weaveResponse = await POST(weaveRequest);
      expect(weaveResponse.headers.get('content-disposition')).toContain('magic_schools8.json');
    });

    it('should format JSON with proper indentation', async () => {
      await prisma.arkanaData.create({
        data: {
          id: 'format_test',
          arkanaDataType: 'flaw',
          jsonData: { name: 'Format Test', cost: 1 }
        }
      });

      const request = createMockPostRequest('/api/arkana/admin/arkana-data/export', {
        token: adminToken,
        type: 'flaw'
      });

      const response = await POST(request);
      const jsonText = await response.text();

      // Check for 2-space indentation
      expect(jsonText).toContain('  "id"');
      expect(jsonText).toContain('  "name"');
      // Should be multiline
      expect(jsonText.split('\n').length).toBeGreaterThan(5);
    });

    it('should include stats in response header', async () => {
      await prisma.arkanaData.create({
        data: {
          id: 'stats_test',
          arkanaDataType: 'flaw',
          jsonData: { name: 'Stats Test', cost: 1, desc: 'Test flaw for stats' }
        }
      });

      const request = createMockPostRequest('/api/arkana/admin/arkana-data/export', {
        token: adminToken,
        type: 'flaw'
      });

      const response = await POST(request);
      const statsHeader = response.headers.get('x-export-stats');

      expect(statsHeader).toBeDefined();
      const stats = JSON.parse(statsHeader!);
      expect(stats.itemCount).toBeGreaterThan(0);
      expect(stats.sizeBytes).toBeGreaterThan(0);
    });

    it('should validate data before export', async () => {
      // Create invalid data (missing required fields based on validation)
      await prisma.arkanaData.create({
        data: {
          id: 'invalid_flaw',
          arkanaDataType: 'flaw',
          jsonData: {} // Empty data
        }
      });

      const request = createMockPostRequest('/api/arkana/admin/arkana-data/export', {
        token: adminToken,
        type: 'flaw'
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      // Should fail validation
      expectError(data);
      expect(data.validationErrors).toBeDefined();
      expect(response.status).toBe(400);
    });

    it('should deny access to non-admin users', async () => {
      const request = createMockPostRequest('/api/arkana/admin/arkana-data/export', {
        token: playerToken,
        type: 'flaw'
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(403);
    });

    it('should validate type parameter', async () => {
      const request = createMockPostRequest('/api/arkana/admin/arkana-data/export', {
        token: adminToken,
        type: 'invalid_type'
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/arkana/admin/arkana-data/export (stats)', () => {
    it('should return export stats for admin', async () => {
      await prisma.arkanaData.createMany({
        data: [
          { id: 'stats_flaw_1', arkanaDataType: 'flaw', jsonData: { name: 'Flaw 1', cost: 1 } },
          { id: 'stats_flaw_2', arkanaDataType: 'flaw', jsonData: { name: 'Flaw 2', cost: 2 } }
        ]
      });

      const request = createMockGetRequest('/api/arkana/admin/arkana-data/export', {
        token: adminToken,
        type: 'flaw'
      });

      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.stats).toBeDefined();
      expect(data.data.stats.itemCount).toBeGreaterThanOrEqual(2);
      expect(data.data.stats.sizeBytes).toBeGreaterThan(0);
      expect(data.data.stats.filename).toBe('flaws3.json');
      expect(data.data.valid).toBeDefined();
    });

    it('should return validation errors if data is invalid', async () => {
      await prisma.arkanaData.create({
        data: {
          id: 'invalid_data',
          arkanaDataType: 'flaw',
          jsonData: {} // Empty/invalid
        }
      });

      const request = createMockGetRequest('/api/arkana/admin/arkana-data/export', {
        token: adminToken,
        type: 'flaw'
      });

      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.valid).toBe(false);
      expect(data.data.validationErrors).toBeDefined();
      expect(data.data.validationErrors.length).toBeGreaterThan(0);
    });

    it('should deny access to non-admin users', async () => {
      const request = createMockGetRequest('/api/arkana/admin/arkana-data/export', {
        token: playerToken,
        type: 'flaw'
      });

      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(403);
    });
  });
});
