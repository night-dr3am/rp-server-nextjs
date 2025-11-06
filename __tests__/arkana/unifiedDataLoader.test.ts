// Tests for Unified Data Loader
// Verifies DB-first loading, JSON fallback, and caching behavior

import { prisma } from '@/lib/prisma';
import {
  loadArkanaData,
  loadFlaws,
  loadCommonPowers,
  loadArchetypePowers,
  loadPerks,
  loadMagicSchools,
  loadMagicWeaves,
  loadCybernetics,
  loadSkills,
  loadEffects,
  loadAllMagic,
  getArkanaDataById,
  invalidateCache,
  isDatabasePopulated,
  getDataSourceInfo
} from '@/lib/arkana/unifiedDataLoader';

describe('Unified Data Loader', () => {
  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.arkanaData.deleteMany({});
  });

  afterEach(async () => {
    // Clean cache and database after each test
    invalidateCache();
    await prisma.arkanaData.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('JSON Fallback (Database Empty)', () => {
    test('should load flaws from JSON when database is empty', async () => {
      const flaws = await loadFlaws();
      expect(Array.isArray(flaws)).toBe(true);
      expect(flaws.length).toBeGreaterThan(0);
      expect(flaws[0]).toHaveProperty('id');
      expect(flaws[0]).toHaveProperty('name');
    });

    test('should load common powers from JSON when database is empty', async () => {
      const powers = await loadCommonPowers();
      expect(Array.isArray(powers)).toBe(true);
      expect(powers.length).toBeGreaterThan(0);
      expect(powers[0]).toHaveProperty('id');
      expect(powers[0]).toHaveProperty('name');
    });

    test('should load archetype powers from JSON when database is empty', async () => {
      const powers = await loadArchetypePowers();
      expect(Array.isArray(powers)).toBe(true);
      expect(powers.length).toBeGreaterThan(0);
    });

    test('should load perks from JSON when database is empty', async () => {
      const perks = await loadPerks();
      expect(Array.isArray(perks)).toBe(true);
      expect(perks.length).toBeGreaterThan(0);
    });

    test('should load magic schools from JSON when database is empty', async () => {
      const schools = await loadMagicSchools();
      expect(Array.isArray(schools)).toBe(true);
      expect(schools.length).toBeGreaterThan(0);
      // All should start with "school_"
      expect(schools.every(s => s.id.startsWith('school_'))).toBe(true);
    });

    test('should load magic weaves from JSON when database is empty', async () => {
      const weaves = await loadMagicWeaves();
      expect(Array.isArray(weaves)).toBe(true);
      expect(weaves.length).toBeGreaterThan(0);
      // None should start with "school_"
      expect(weaves.every(w => !w.id.startsWith('school_'))).toBe(true);
    });

    test('should load cybernetics from JSON when database is empty', async () => {
      const cybernetics = await loadCybernetics();
      expect(Array.isArray(cybernetics)).toBe(true);
      expect(cybernetics.length).toBeGreaterThan(0);
    });

    test('should load skills from JSON when database is empty', async () => {
      const skills = await loadSkills();
      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBeGreaterThan(0);
    });

    test('should load effects from JSON when database is empty', async () => {
      const effects = await loadEffects();
      expect(Array.isArray(effects)).toBe(true);
      expect(effects.length).toBeGreaterThan(0);
    });

    test('should load all magic (schools + weaves combined)', async () => {
      const allMagic = await loadAllMagic();
      const schools = await loadMagicSchools();
      const weaves = await loadMagicWeaves();

      expect(allMagic.length).toBe(schools.length + weaves.length);
    });
  });

  describe('Database Loading', () => {
    test('should load from database when data exists', async () => {
      // Insert test data
      await prisma.arkanaData.create({
        data: {
          id: 'test_flaw_1',
          type: 'flaw',
          jsonData: {
            name: 'Test Flaw',
            desc: 'A test flaw',
            cost: 2
          }
        }
      });

      // Load flaws
      const flaws = await loadFlaws();

      // Should find our test flaw
      const testFlaw = flaws.find(f => f.id === 'test_flaw_1');
      expect(testFlaw).toBeDefined();
      expect(testFlaw?.name).toBe('Test Flaw');
      expect(testFlaw?.cost).toBe(2);
    });

    test('should reconstruct objects with id field from database', async () => {
      await prisma.arkanaData.create({
        data: {
          id: 'test_power_1',
          type: 'commonPower',
          jsonData: {
            name: 'Test Power',
            desc: 'A test power',
            cost: 3,
            species: 'human'
          }
        }
      });

      const powers = await loadCommonPowers();
      const testPower = powers.find(p => p.id === 'test_power_1');

      // ID should be reconstructed from database
      expect(testPower).toBeDefined();
      expect(testPower?.id).toBe('test_power_1');
      expect(testPower?.name).toBe('Test Power');
    });

    test('should load multiple items of same type from database', async () => {
      await prisma.arkanaData.createMany({
        data: [
          { id: 'perk_1', type: 'perk', jsonData: { name: 'Perk 1', cost: 1 } },
          { id: 'perk_2', type: 'perk', jsonData: { name: 'Perk 2', cost: 2 } },
          { id: 'perk_3', type: 'perk', jsonData: { name: 'Perk 3', cost: 3 } }
        ]
      });

      const perks = await loadPerks();

      const testPerks = perks.filter(p => p.id.startsWith('perk_'));
      expect(testPerks.length).toBe(3);
    });
  });

  describe('Caching Behavior', () => {
    test('should cache data after first load', async () => {
      // First load
      const flaws1 = await loadFlaws();

      // Second load should return same array instance from cache
      const flaws2 = await loadFlaws();

      // Not just equal, but same reference
      expect(flaws1).toBe(flaws2);
    });

    test('should cache each type independently', async () => {
      const flaws = await loadFlaws();
      const perks = await loadPerks();

      // Different types should have different cache entries
      expect(flaws).not.toBe(perks);
    });

    test('should invalidate cache for specific type', async () => {
      // Insert DB data first
      await prisma.arkanaData.create({
        data: {
          id: 'cache_test_flaw',
          type: 'flaw',
          jsonData: { name: 'Cache Test', cost: 1 }
        }
      });

      // Load and cache (from DB)
      const flaws1 = await loadFlaws();
      const testFlaw1 = flaws1.find(f => f.id === 'cache_test_flaw');
      expect(testFlaw1).toBeDefined();

      // Update DB data
      await prisma.arkanaData.update({
        where: { id: 'cache_test_flaw' },
        data: {
          jsonData: { name: 'Cache Test Updated', cost: 2 }
        }
      });

      // Without invalidation, should still get old data
      const flaws2 = await loadFlaws();
      const testFlaw2 = flaws2.find(f => f.id === 'cache_test_flaw');
      expect(testFlaw2?.name).toBe('Cache Test'); // Still old data

      // Invalidate cache
      invalidateCache('flaw');

      // Load again (should reload from DB with new data)
      const flaws3 = await loadFlaws();
      const testFlaw3 = flaws3.find(f => f.id === 'cache_test_flaw');
      expect(testFlaw3?.name).toBe('Cache Test Updated'); // New data
    });

    test('should invalidate all caches when no type specified', async () => {
      // Insert test data for multiple types
      await prisma.arkanaData.createMany({
        data: [
          { id: 'cache_flaw_all', type: 'flaw', jsonData: { name: 'Test Flaw', cost: 1 } },
          { id: 'cache_perk_all', type: 'perk', jsonData: { name: 'Test Perk', cost: 2 } }
        ]
      });

      // Load and cache
      const flaws1 = await loadFlaws();
      const perks1 = await loadPerks();

      expect(flaws1.find(f => f.id === 'cache_flaw_all')).toBeDefined();
      expect(perks1.find(p => p.id === 'cache_perk_all')).toBeDefined();

      // Update both
      await prisma.arkanaData.updateMany({
        where: { id: { in: ['cache_flaw_all', 'cache_perk_all'] } },
        data: { updatedAt: new Date() }
      });

      // Clear all caches
      invalidateCache();

      // Reload both (should get fresh data from DB)
      const flaws2 = await loadFlaws();
      const perks2 = await loadPerks();

      // Should still find the items (proves reload happened)
      expect(flaws2.find(f => f.id === 'cache_flaw_all')).toBeDefined();
      expect(perks2.find(p => p.id === 'cache_perk_all')).toBeDefined();
    });
  });

  describe('Helper Functions', () => {
    test('getArkanaDataById should find item by ID', async () => {
      await prisma.arkanaData.create({
        data: {
          id: 'unique_flaw',
          type: 'flaw',
          jsonData: { name: 'Unique Flaw', cost: 5 }
        }
      });

      const flaw = await getArkanaDataById('flaw', 'unique_flaw');
      expect(flaw).toBeDefined();
      expect((flaw as any).name).toBe('Unique Flaw');
    });

    test('getArkanaDataById should return null for non-existent ID', async () => {
      const result = await getArkanaDataById('flaw', 'non_existent_id_12345');
      expect(result).toBeNull();
    });

    test('isDatabasePopulated should return false when empty', async () => {
      const populated = await isDatabasePopulated();
      expect(populated).toBe(false);
    });

    test('isDatabasePopulated should return true when data exists', async () => {
      await prisma.arkanaData.create({
        data: {
          id: 'any_item',
          type: 'flaw',
          jsonData: { name: 'Any Item' }
        }
      });

      const populated = await isDatabasePopulated();
      expect(populated).toBe(true);
    });

    test('getDataSourceInfo should return source information for all types', async () => {
      // Add some DB data for one type
      await prisma.arkanaData.create({
        data: {
          id: 'db_flaw',
          type: 'flaw',
          jsonData: { name: 'DB Flaw' }
        }
      });

      const info = await getDataSourceInfo();

      expect(info).toHaveLength(9); // 9 types total

      const flawInfo = info.find(i => i.type === 'flaw');
      const perkInfo = info.find(i => i.type === 'perk');

      expect(flawInfo?.source).toBe('database');
      expect(perkInfo?.source).toBe('json');
      expect(flawInfo?.count).toBeGreaterThan(0);
      expect(perkInfo?.count).toBeGreaterThan(0);
    });
  });

  describe('Type-Specific Loaders', () => {
    test('all type-specific loaders should work', async () => {
      // Test all type-specific convenience functions
      const results = await Promise.all([
        loadFlaws(),
        loadCommonPowers(),
        loadArchetypePowers(),
        loadPerks(),
        loadMagicSchools(),
        loadMagicWeaves(),
        loadCybernetics(),
        loadSkills(),
        loadEffects()
      ]);

      // All should return arrays
      results.forEach((result, index) => {
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Data Integrity', () => {
    test('loaded items should have required fields', async () => {
      const flaws = await loadFlaws();
      const firstFlaw = flaws[0];

      expect(firstFlaw).toHaveProperty('id');
      expect(firstFlaw).toHaveProperty('name');
      expect(typeof firstFlaw.id).toBe('string');
      expect(typeof firstFlaw.name).toBe('string');
    });

    test('magic schools and weaves should not overlap', async () => {
      const schools = await loadMagicSchools();
      const weaves = await loadMagicWeaves();

      const schoolIds = new Set(schools.map(s => s.id));
      const weaveIds = new Set(weaves.map(w => w.id));

      // No overlap
      const intersection = [...schoolIds].filter(id => weaveIds.has(id));
      expect(intersection).toHaveLength(0);
    });

    test('database items should match JSON structure', async () => {
      // Load from JSON first
      const jsonFlaws = await loadFlaws();
      const sampleFlaw = jsonFlaws[0];

      // Insert same structure to DB
      await prisma.arkanaData.create({
        data: {
          id: 'db_structure_test',
          type: 'flaw',
          jsonData: {
            name: sampleFlaw.name,
            desc: sampleFlaw.desc,
            cost: sampleFlaw.cost
          }
        }
      });

      // Clear cache to force reload from DB
      invalidateCache('flaw');

      // Load again (should include DB item)
      const dbFlaws = await loadFlaws();
      const dbFlaw = dbFlaws.find(f => f.id === 'db_structure_test');

      // Structure should match
      expect(dbFlaw).toHaveProperty('id');
      expect(dbFlaw).toHaveProperty('name');
      expect(dbFlaw).toHaveProperty('desc');
      expect(dbFlaw).toHaveProperty('cost');
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      // Disconnect prisma to simulate error
      await prisma.$disconnect();

      // Should fall back to JSON
      const flaws = await loadFlaws();
      expect(Array.isArray(flaws)).toBe(true);
      expect(flaws.length).toBeGreaterThan(0);

      // Reconnect for other tests
      await prisma.$connect();
    });

    test('should throw error for unknown type', async () => {
      await expect(
        loadArkanaData('invalid_type' as any)
      ).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    test('cached loads should be faster than initial loads', async () => {
      // Warm up (ensure any lazy loading is done)
      await loadFlaws();
      invalidateCache('flaw');

      // First load (not cached) - measure 10 iterations
      const start1 = Date.now();
      for (let i = 0; i < 10; i++) {
        invalidateCache('flaw');
        await loadFlaws();
      }
      const duration1 = Date.now() - start1;

      // Second load (cached) - measure 10 iterations
      const start2 = Date.now();
      for (let i = 0; i < 10; i++) {
        await loadFlaws(); // Should hit cache
      }
      const duration2 = Date.now() - start2;

      // Cached should be significantly faster (at least 3x for 10 iterations)
      expect(duration2).toBeLessThan(duration1 / 3);
    });

    test('should handle loading all types concurrently', async () => {
      const start = Date.now();

      await Promise.all([
        loadFlaws(),
        loadCommonPowers(),
        loadArchetypePowers(),
        loadPerks(),
        loadMagicSchools(),
        loadMagicWeaves(),
        loadCybernetics(),
        loadSkills(),
        loadEffects()
      ]);

      const duration = Date.now() - start;

      // Should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);
    });
  });
});
