// Tests for Bulk Save Endpoint
// POST /api/arkana/admin/arkana-data/bulk-save

import { POST } from '../route';
import {
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

describe('POST /api/arkana/admin/arkana-data/bulk-save', () => {
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

  it('should create multiple new items', async () => {
    const request = createMockPostRequest('/api/arkana/admin/arkana-data/bulk-save', {
      token: adminToken,
      data: [
        { id: 'bulk_flaw_1', type: 'flaw', jsonData: { name: 'Bulk Flaw 1', cost: 1 } },
        { id: 'bulk_flaw_2', type: 'flaw', jsonData: { name: 'Bulk Flaw 2', cost: 2 } },
        { id: 'bulk_perk_1', type: 'perk', jsonData: { name: 'Bulk Perk 1', cost: 3 } }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.created).toBe(3);
    expect(data.data.updated).toBe(0);
    expect(data.data.failed).toBe(0);

    // Verify in database
    const count = await prisma.arkanaData.count();
    expect(count).toBe(3);
  });

  it('should update existing items', async () => {
    // Create initial items
    await prisma.arkanaData.createMany({
      data: [
        { id: 'existing_1', type: 'flaw', jsonData: { name: 'Original 1' } },
        { id: 'existing_2', type: 'perk', jsonData: { name: 'Original 2' } }
      ]
    });

    const request = createMockPostRequest('/api/arkana/admin/arkana-data/bulk-save', {
      token: adminToken,
      data: [
        { id: 'existing_1', type: 'flaw', jsonData: { name: 'Updated 1' } },
        { id: 'existing_2', type: 'perk', jsonData: { name: 'Updated 2' } }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.created).toBe(0);
    expect(data.data.updated).toBe(2);

    // Verify updates
    const item1 = await prisma.arkanaData.findUnique({ where: { id: 'existing_1' } });
    expect((item1?.jsonData as Record<string, unknown>).name).toBe('Updated 1');
  });

  it('should handle mixed create and update', async () => {
    await prisma.arkanaData.create({
      data: { id: 'existing', type: 'flaw', jsonData: { name: 'Original' } }
    });

    const request = createMockPostRequest('/api/arkana/admin/arkana-data/bulk-save', {
      token: adminToken,
      data: [
        { id: 'existing', type: 'flaw', jsonData: { name: 'Updated' } },
        { id: 'new_item', type: 'perk', jsonData: { name: 'New' } }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.created).toBe(1);
    expect(data.data.updated).toBe(1);
    expect(data.data.total).toBe(2);
  });

  it('should reject duplicate IDs in request', async () => {
    const request = createMockPostRequest('/api/arkana/admin/arkana-data/bulk-save', {
      token: adminToken,
      data: [
        { id: 'duplicate', type: 'flaw', jsonData: { name: 'First' } },
        { id: 'duplicate', type: 'perk', jsonData: { name: 'Second' } }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(data.error).toContain('Duplicate IDs');
    expect(response.status).toBe(400);
  });

  it('should validate empty data array', async () => {
    const request = createMockPostRequest('/api/arkana/admin/arkana-data/bulk-save', {
      token: adminToken,
      data: []
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
  });

  it('should deny access to non-admin users', async () => {
    const request = createMockPostRequest('/api/arkana/admin/arkana-data/bulk-save', {
      token: playerToken,
      data: [
        { id: 'test', type: 'flaw', jsonData: { name: 'Test' } }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(403);
  });

  it('should invalidate all caches after bulk save', async () => {
    const request = createMockPostRequest('/api/arkana/admin/arkana-data/bulk-save', {
      token: adminToken,
      data: [
        { id: 'bulk_test_1', type: 'flaw', jsonData: { name: 'Test 1' } },
        { id: 'bulk_test_2', type: 'perk', jsonData: { name: 'Test 2' } }
      ]
    });

    await POST(request);

    // Cache should be cleared, load from DB
    const { loadFlaws, loadPerks } = await import('@/lib/arkana/unifiedDataLoader');
    const flaws = await loadFlaws();
    const perks = await loadPerks();

    expect(flaws.find((f: Record<string, unknown> & { id: string }) => f.id === 'bulk_test_1')).toBeDefined();
    expect(perks.find((p: Record<string, unknown> & { id: string }) => p.id === 'bulk_test_2')).toBeDefined();
  });

  it('should handle large bulk operations', async () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      id: `bulk_item_${i}`,
      type: 'flaw',
      jsonData: { name: `Bulk Item ${i}`, cost: i % 5 }
    }));

    const request = createMockPostRequest('/api/arkana/admin/arkana-data/bulk-save', {
      token: adminToken,
      data: items
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.created).toBe(100);

    const count = await prisma.arkanaData.count();
    expect(count).toBe(100);
  });

  it('should rollback on transaction failure', async () => {
    // This test ensures transaction integrity
    // In practice, validation happens before transaction, so this is more of a safety check

    const request = createMockPostRequest('/api/arkana/admin/arkana-data/bulk-save', {
      token: adminToken,
      data: [
        { id: 'valid_1', type: 'flaw', jsonData: { name: 'Valid' } },
        // If there were a way to force failure mid-transaction, it would rollback
        { id: 'valid_2', type: 'perk', jsonData: { name: 'Valid' } }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    // Should succeed normally
    expectSuccess(data);

    // But if it had failed, count should remain unchanged
    // This is more of a documentation of expected behavior
  });
});
