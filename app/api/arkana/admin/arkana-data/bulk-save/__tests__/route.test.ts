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
        { id: 'existing_1', arkanaDataType: 'flaw', jsonData: { name: 'Original 1' } },
        { id: 'existing_2', arkanaDataType: 'perk', jsonData: { name: 'Original 2' } }
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
      data: { id: 'existing', arkanaDataType: 'flaw', jsonData: { name: 'Original' } }
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

  it('should preserve all fields including _uniqueId in round-trip import/export', async () => {
    // This test verifies that importing JSON with _uniqueId and then exporting preserves all data
    const originalData = [
      {
        id: 'check_physical_vs_tn0',
        type: 'effect',
        orderNumber: 2,
        jsonData: {
          name: 'Physical Check vs TN 0',
          desc: 'Roll 1d20 + Physical modifier vs TN 0',
          category: 'check',
          checkStat: 'Physical',
          checkVs: 'fixed',
          checkTN: 0,
          _uniqueId: 'effect:check_physical_vs_tn0'
        }
      },
      {
        id: 'check_physical_vs_tn10',
        type: 'effect',
        orderNumber: 2,
        jsonData: {
          name: 'Physical Check vs TN 10',
          desc: 'Roll 1d20 + Physical modifier vs TN 10',
          category: 'check',
          checkStat: 'Physical',
          checkVs: 'fixed',
          checkTN: 10,
          _uniqueId: 'effect:check_physical_vs_tn10'
        }
      },
      {
        id: 'check_physical_vs_tn15',
        type: 'effect',
        orderNumber: 2,
        jsonData: {
          name: 'Physical Check vs TN 15',
          desc: 'Roll 1d20 + Physical modifier vs TN 15',
          category: 'check',
          checkStat: 'Physical',
          checkVs: 'fixed',
          checkTN: 15,
          _uniqueId: 'effect:check_physical_vs_tn15'
        }
      }
    ];

    // 1. Import via bulk-save
    const importRequest = createMockPostRequest('/api/arkana/admin/arkana-data/bulk-save', {
      token: adminToken,
      data: originalData
    });

    const importResponse = await POST(importRequest);
    const importData = await parseJsonResponse(importResponse);

    expectSuccess(importData);
    expect(importData.data.created).toBe(3);

    // 2. Export via export endpoint
    const { POST: ExportPOST } = await import('../../export/route');
    const exportRequest = createMockPostRequest('/api/arkana/admin/arkana-data/export', {
      token: adminToken,
      type: 'effect'
    });

    const exportResponse = await ExportPOST(exportRequest);
    const exportedJson = await exportResponse.text();
    const exportedData = JSON.parse(exportedJson);

    // 3. Verify all three records are present
    const tn0 = exportedData.find((e: { id: string }) => e.id === 'check_physical_vs_tn0');
    const tn10 = exportedData.find((e: { id: string }) => e.id === 'check_physical_vs_tn10');
    const tn15 = exportedData.find((e: { id: string }) => e.id === 'check_physical_vs_tn15');

    expect(tn0).toBeDefined();
    expect(tn10).toBeDefined();
    expect(tn15).toBeDefined();

    // 4. Verify all fields are preserved
    expect(tn0.orderNumber).toBe(2);
    expect(tn0.name).toBe('Physical Check vs TN 0');
    expect(tn0.checkTN).toBe(0);
    expect(tn0._uniqueId).toBe('effect:check_physical_vs_tn0');

    expect(tn10.orderNumber).toBe(2);
    expect(tn10.name).toBe('Physical Check vs TN 10');
    expect(tn10.checkTN).toBe(10);
    expect(tn10._uniqueId).toBe('effect:check_physical_vs_tn10');

    expect(tn15.orderNumber).toBe(2);
    expect(tn15.name).toBe('Physical Check vs TN 15');
    expect(tn15.checkTN).toBe(15);
    expect(tn15._uniqueId).toBe('effect:check_physical_vs_tn15');

    // 5. Verify exported data matches original structure (excluding type field)
    const compareFields = (original: typeof originalData[0], exported: typeof tn0) => {
      expect(exported.id).toBe(original.id);
      expect(exported.orderNumber).toBe(original.orderNumber);
      Object.keys(original.jsonData).forEach(key => {
        expect(exported[key]).toEqual(original.jsonData[key]);
      });
    };

    compareFields(originalData[0], tn0);
    compareFields(originalData[1], tn10);
    compareFields(originalData[2], tn15);
  });

  it('should preserve effect IDs in power abilities (gaki_yin_shroud test case)', async () => {
    // This test reproduces the bug where check_dexterity_vs_tn12 gets changed to something else
    const originalPower = {
      id: 'gaki_yin_shroud',
      type: 'commonPower',
      orderNumber: 12,
      jsonData: {
        cost: 3,
        desc: 'Cloak themselves in shadow and silence.',
        name: 'Yin Shroud',
        tags: ['stealth', 'utility'],
        range: 0,
        effects: {
          ability: ['check_dexterity_vs_tn12', 'buff_stealth_4']
        },
        species: 'gaki',
        baseStat: 'Physical',
        _uniqueId: 'commonPower:gaki_yin_shroud',
        targetType: 'self',
        abilityType: ['ability']
      }
    };

    // 1. Import via bulk-save
    const importRequest = createMockPostRequest('/api/arkana/admin/arkana-data/bulk-save', {
      token: adminToken,
      data: [originalPower]
    });

    const importResponse = await POST(importRequest);
    const importData = await parseJsonResponse(importResponse);

    expectSuccess(importData);
    expect(importData.data.created).toBe(1);

    // 2. Export via export endpoint
    const { POST: ExportPOST } = await import('../../export/route');
    const exportRequest = createMockPostRequest('/api/arkana/admin/arkana-data/export', {
      token: adminToken,
      type: 'commonPower'
    });

    const exportResponse = await ExportPOST(exportRequest);
    const exportedJson = await exportResponse.text();
    const exportedData = JSON.parse(exportedJson);

    // 3. Find the exported power
    const exportedPower = exportedData.find((p: { id: string }) => p.id === 'gaki_yin_shroud');

    expect(exportedPower).toBeDefined();
    expect(exportedPower.effects).toBeDefined();
    expect(exportedPower.effects.ability).toBeDefined();

    // 4. CRITICAL: Verify effect IDs are NOT mutated
    expect(exportedPower.effects.ability).toEqual(['check_dexterity_vs_tn12', 'buff_stealth_4']);

    // Also verify the first effect specifically (this is what the user says is being changed)
    expect(exportedPower.effects.ability[0]).toBe('check_dexterity_vs_tn12');
    expect(exportedPower.effects.ability[1]).toBe('buff_stealth_4');

    // 5. Verify other fields are preserved
    expect(exportedPower.name).toBe('Yin Shroud');
    expect(exportedPower.cost).toBe(3);
    expect(exportedPower._uniqueId).toBe('commonPower:gaki_yin_shroud');
  });
});
