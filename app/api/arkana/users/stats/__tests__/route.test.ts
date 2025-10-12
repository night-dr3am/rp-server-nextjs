import { GET, POST } from '../route';
import {
  createMockGetRequest,
  createMockPostRequest,
  createApiBody,
  createTestUser,
  cleanupDatabase,
  expectSuccess,
  expectError,
  parseJsonResponse,
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { prisma } from '@/lib/prisma';

describe('/api/arkana/users/stats', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  describe('GET', () => {
    it('should retrieve user stats with Arkana character data', async () => {
      const { user } = await createTestUser('arkana');

      // Create Arkana character for the user
      await prisma.arkanaStats.create({
        data: {
          userId: user.id,
          characterName: 'Test Character',
          agentName: 'TestAgent',
          race: 'human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 2,
          mental: 4,
          perception: 3,
          hitPoints: 15,
          statPointsPool: 0,
          statPointsSpent: 6,
          flaws: ['flaw_addiction'],
          flawPointsGranted: 3,
          powerPointsBudget: 15,
          powerPointsBonus: 3,
          powerPointsSpent: 0,
          credits: 1000,
          chips: 500,
          xp: 0,
          registrationCompleted: true
        }
      });

      const params = createApiBody({
        sl_uuid: user.slUuid,
        universe: 'arkana'
      }, 'arkana');

      const request = createMockGetRequest('/api/arkana/users/stats', params);
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.user.slUuid).toBe(user.slUuid);
      expect(data.data.user.universe).toBe('arkana');
      expect(data.data.arkanaStats).toBeDefined();
      expect(decodeURIComponent(data.data.arkanaStats.characterName)).toBe('Test Character');
      expect(data.data.arkanaStats.race).toBe('human');
      expect(data.data.arkanaStats.archetype).toBe('Arcanist');
      expect(data.data.arkanaStats.hitPoints).toBe(15);
      expect(data.data.arkanaStats.credits).toBe(1000);
      expect(data.data.arkanaStats.chips).toBe(500);
      expect(data.data.hasArkanaCharacter).toBe("true");
    });

    it('should retrieve user stats without Arkana character data', async () => {
      const { user } = await createTestUser('arkana');
      // Don't create arkanaStats - user exists but has no character

      const params = createApiBody({
        sl_uuid: user.slUuid,
        universe: 'arkana'
      }, 'arkana');

      const request = createMockGetRequest('/api/arkana/users/stats', params);
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.user.slUuid).toBe(user.slUuid);
      expect(data.data.user.universe).toBe('arkana');
      expect(data.data.stats).toBeDefined(); // Basic stats should exist
      expect(data.data.arkanaStats).toBeNull();
      expect(data.data.hasArkanaCharacter).toBe("false");
    });

    it('should return 404 for user not found in Arkana universe', async () => {
      const params = createApiBody({
        sl_uuid: '550e8400-e29b-41d4-a716-446655440999', // Non-existent user
        universe: 'arkana'
      }, 'arkana');

      const request = createMockGetRequest('/api/arkana/users/stats', params);
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'User not found in Arkana universe');
      expect(response.status).toBe(404);
    });

    it('should return 401 for invalid signature', async () => {
      const { user } = await createTestUser('arkana');

      const params = {
        sl_uuid: user.slUuid,
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'invalid-signature'
      };

      const request = createMockGetRequest('/api/arkana/users/stats', params);
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      // Could be 400 if validation fails first, or 401 if signature validation fails
      expect([400, 401]).toContain(response.status);
    });

    it('should return 400 for invalid universe', async () => {
      const { user } = await createTestUser('arkana');

      const params = createApiBody({
        sl_uuid: user.slUuid,
        universe: 'gor' // Wrong universe
      }, 'gor'); // Use gor signature

      const request = createMockGetRequest('/api/arkana/users/stats', params);
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(400);
      expect(data.error).toContain('must be [arkana]');
    });

    it('should return 400 for invalid UUID format', async () => {
      const params = createApiBody({
        sl_uuid: 'invalid-uuid',
        universe: 'arkana'
      }, 'arkana');

      const request = createMockGetRequest('/api/arkana/users/stats', params);
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(400);
      expect(data.error).toContain('must be a valid GUID');
    });

  it('should handle empty activeEffects and liveStats gracefully', async () => {
    const { user } = await createTestUser('arkana');

    // Create Arkana character with explicitly null/empty activeEffects and liveStats
    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Empty LiveStats Test',
        agentName: 'TestAgent',
        race: 'human',
        archetype: 'Arcanist',
        physical: 3,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 15,
        statPointsPool: 0,
        statPointsSpent: 6,
        flaws: ['flaw_addiction'],
        flawPointsGranted: 3,
        powerPointsBudget: 15,
        powerPointsBonus: 3,
        powerPointsSpent: 0,
        credits: 1000,
        chips: 500,
        xp: 0,
        registrationCompleted: true,
        // Explicitly set these to potential problem values
        activeEffects: [],
        liveStats: {}
      }
    });

    const params = createApiBody({
      sl_uuid: user.slUuid,
      universe: 'arkana'
    }, 'arkana');

    const request = createMockGetRequest('/api/arkana/users/stats', params);
    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.user.slUuid).toBe(user.slUuid);
    expect(data.data.arkanaStats).toBeDefined();
    expect(decodeURIComponent(data.data.arkanaStats.characterName)).toBe('Empty LiveStats Test');
    // liveStatsString should be empty string when no active effects
    expect(data.data.arkanaStats.liveStatsString).toBe('');
  });

  it('should handle corrupted activeEffects gracefully', async () => {
    const { user } = await createTestUser('arkana');

    // Create Arkana character with corrupted activeEffects (non-array value)
    const arkanaStats = await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Corrupted Data Test',
        agentName: 'TestAgent',
        race: 'human',
        archetype: 'Arcanist',
        physical: 3,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 15,
        statPointsPool: 0,
        statPointsSpent: 6,
        flaws: ['flaw_addiction'],
        flawPointsGranted: 3,
        powerPointsBudget: 15,
        powerPointsBonus: 3,
        powerPointsSpent: 0,
        credits: 1000,
        chips: 500,
        xp: 0,
        registrationCompleted: true,
        activeEffects: [],
        liveStats: {}
      }
    });

    // Manually corrupt the activeEffects field in the database using raw SQL
    await prisma.$executeRaw`UPDATE arkana_stats SET active_effects = '{"invalid": "json"}' WHERE id = ${arkanaStats.id}`;

    const params = createApiBody({
      sl_uuid: user.slUuid,
      universe: 'arkana'
    }, 'arkana');

    const request = createMockGetRequest('/api/arkana/users/stats', params);
    const response = await GET(request);
    const data = await parseJsonResponse(response);

    // Should still succeed, just with empty liveStatsString
    expectSuccess(data);
    expect(data.data.user.slUuid).toBe(user.slUuid);
    expect(data.data.arkanaStats).toBeDefined();
    expect(decodeURIComponent(data.data.arkanaStats.characterName)).toBe('Corrupted Data Test');
    // liveStatsString should be empty when data is corrupted
    expect(data.data.arkanaStats.liveStatsString).toBe('');
  });

  it('should return complete arkana character data structure', async () => {
    const { user } = await createTestUser('arkana');

    // Create comprehensive Arkana character
    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Complete Character',
        agentName: 'CompleteAgent',
        aliasCallsign: 'CC',
        faction: 'Test Faction',
        conceptRole: 'Hacker',
        job: 'Data Analyst',
        background: 'Born in the sprawl',
        race: 'strigoi',
        subrace: 'Life',
        archetype: 'Life',
        physical: 2,
        dexterity: 3,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        statPointsPool: 0,
        statPointsSpent: 6,
        inherentPowers: ['power_life_sense'],
        weaknesses: ['weakness_sunlight'],
        flaws: ['flaw_addiction', 'flaw_phobia'],
        flawPointsGranted: 5,
        powerPointsBudget: 15,
        powerPointsBonus: 5,
        powerPointsSpent: 8,
        commonPowers: ['power_enhanced_senses'],
        archetypePowers: ['power_life_drain'],
        perks: ['perk_tech_savvy'],
        magicSchools: ['school_technomancy'],
        magicWeaves: ['weave_data_stream'],
        cybernetics: ['cyber_neural_interface'],
        cyberneticAugments: ['augment_memory_boost'],
        credits: 2500,
        chips: 750,
        xp: 100,
        registrationCompleted: true
      }
    });

    const params = createApiBody({
      sl_uuid: user.slUuid,
      universe: 'arkana'
    }, 'arkana');

    const request = createMockGetRequest('/api/arkana/users/stats', params);
    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);

    const arkanaStats = data.data.arkanaStats;
    expect(decodeURIComponent(arkanaStats.characterName)).toBe('Complete Character');
    expect(decodeURIComponent(arkanaStats.agentName)).toBe('CompleteAgent');
    expect(decodeURIComponent(arkanaStats.aliasCallsign)).toBe('CC');
    expect(decodeURIComponent(arkanaStats.faction)).toBe('Test Faction');
    expect(decodeURIComponent(arkanaStats.conceptRole)).toBe('Hacker');
    expect(decodeURIComponent(arkanaStats.job)).toBe('Data Analyst');
    expect(decodeURIComponent(arkanaStats.background)).toBe('Born in the sprawl');
    expect(decodeURIComponent(arkanaStats.race)).toBe('strigoi');
    expect(decodeURIComponent(arkanaStats.subrace)).toBe('Life');
    expect(decodeURIComponent(arkanaStats.archetype)).toBe('Life');
    expect(arkanaStats.physical).toBe(2);
    expect(arkanaStats.dexterity).toBe(3);
    expect(arkanaStats.mental).toBe(4);
    expect(arkanaStats.perception).toBe(3);
    expect(arkanaStats.hitPoints).toBe(10);
    expect(arkanaStats.inherentPowers).toEqual(['power_life_sense']);
    expect(arkanaStats.weaknesses).toEqual(['weakness_sunlight']);
    expect(arkanaStats.flaws).toEqual(['flaw_addiction', 'flaw_phobia']);
    expect(arkanaStats.commonPowers).toEqual(['power_enhanced_senses']);
    expect(arkanaStats.archetypePowers).toEqual(['power_life_drain']);
    expect(arkanaStats.perks).toEqual(['perk_tech_savvy']);
    expect(arkanaStats.magicSchools).toEqual(['school_technomancy']);
    expect(arkanaStats.magicWeaves).toEqual(['weave_data_stream']);
    expect(arkanaStats.cybernetics).toEqual(['cyber_neural_interface']);
    expect(arkanaStats.cyberneticAugments).toEqual(['augment_memory_boost']);
    expect(arkanaStats.credits).toBe(2500);
    expect(arkanaStats.chips).toBe(750);
    expect(arkanaStats.xp).toBe(100);
  });
});

  describe('POST', () => {
    it('should update user stats and return updated values', async () => {
      const { user } = await createTestUser('arkana');

      // Create initial stats
      await prisma.userStats.create({
        data: {
          userId: user.id,
          status: 0,
          health: 50,
          hunger: 75,
          thirst: 80
        }
      });

      const body = createApiBody({
        sl_uuid: user.slUuid,
        universe: 'arkana',
        health: 30,
        hunger: 60,
        thirst: 90
      }, 'arkana');

      const request = createMockPostRequest('/api/arkana/users/stats', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.user.slUuid).toBe(user.slUuid);
      expect(data.data.stats.health).toBe(30);
      expect(data.data.stats.hunger).toBe(60);
      expect(data.data.stats.thirst).toBe(90);
    });

    it('should create stats if they do not exist', async () => {
      const { user } = await createTestUser('arkana');
      // Don't create initial stats - test upsert functionality

      const body = createApiBody({
        sl_uuid: user.slUuid,
        universe: 'arkana',
        status: 5,
        health: 85,
        hunger: 90,
        thirst: 95
      }, 'arkana');

      const request = createMockPostRequest('/api/arkana/users/stats', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.stats.status).toBe(2); // Clamped from 5 to 2 (Arkana max)
      expect(data.data.stats.health).toBe(85);
      expect(data.data.stats.hunger).toBe(90);
      expect(data.data.stats.thirst).toBe(95);
    });

    it('should update only provided stats fields', async () => {
      const { user } = await createTestUser('arkana');

      // Create initial stats
      await prisma.userStats.create({
        data: {
          userId: user.id,
          status: 1, // OOC
          health: 70,
          hunger: 80,
          thirst: 90
        }
      });

      // Update only health
      const body = createApiBody({
        sl_uuid: user.slUuid,
        universe: 'arkana',
        health: 45
      }, 'arkana');

      const request = createMockPostRequest('/api/arkana/users/stats', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.stats.health).toBe(45);
      expect(data.data.stats.hunger).toBe(80); // Should remain unchanged
      expect(data.data.stats.thirst).toBe(90); // Should remain unchanged
      expect(data.data.stats.status).toBe(1); // Should remain unchanged
    });

    it('should clamp stats values to valid ranges', async () => {
      const { user } = await createTestUser('arkana');

      const body = createApiBody({
        sl_uuid: user.slUuid,
        universe: 'arkana',
        status: -5, // Should be clamped to 0
        health: 150, // Should be clamped to 100
        hunger: -10, // Should be clamped to 0
        thirst: 110  // Should be clamped to 100
      }, 'arkana');

      const request = createMockPostRequest('/api/arkana/users/stats', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.stats.status).toBe(0);
      expect(data.data.stats.health).toBe(100);
      expect(data.data.stats.hunger).toBe(0);
      expect(data.data.stats.thirst).toBe(100);
    });

    it('should return arkana character data if present', async () => {
      const { user } = await createTestUser('arkana');

      // Create Arkana character
      await prisma.arkanaStats.create({
        data: {
          userId: user.id,
          characterName: 'Test Character',
          agentName: 'TestAgent',
          race: 'human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 2,
          mental: 4,
          perception: 3,
          hitPoints: 15,
          statPointsPool: 0,
          statPointsSpent: 6,
          flaws: ['flaw_addiction'],
          flawPointsGranted: 3,
          powerPointsBudget: 15,
          powerPointsBonus: 3,
          powerPointsSpent: 0,
          credits: 1000,
          chips: 500,
          xp: 0,
          registrationCompleted: true
        }
      });

      const body = createApiBody({
        sl_uuid: user.slUuid,
        universe: 'arkana',
        health: 75
      }, 'arkana');

      const request = createMockPostRequest('/api/arkana/users/stats', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.arkanaStats).toBeDefined();
      expect(decodeURIComponent(data.data.arkanaStats.characterName)).toBe('Test Character');
      expect(data.data.arkanaStats.credits).toBe(1000);
      expect(data.data.hasArkanaCharacter).toBe("true");
    });

    it('should return 404 for user not found in Arkana universe', async () => {
      const body = createApiBody({
        sl_uuid: '550e8400-e29b-41d4-a716-446655440999', // Non-existent user
        universe: 'arkana',
        health: 50
      }, 'arkana');

      const request = createMockPostRequest('/api/arkana/users/stats', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'User not found in Arkana universe');
      expect(response.status).toBe(404);
    });

    it('should return 401 for invalid signature', async () => {
      const { user } = await createTestUser('arkana');

      const body = {
        sl_uuid: user.slUuid,
        universe: 'arkana',
        health: 50,
        timestamp: new Date().toISOString(),
        signature: 'invalid-signature'
      };

      const request = createMockPostRequest('/api/arkana/users/stats', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect([400, 401]).toContain(response.status);
    });

    it('should return 400 for invalid universe', async () => {
      const { user } = await createTestUser('arkana');

      const body = createApiBody({
        sl_uuid: user.slUuid,
        universe: 'gor', // Wrong universe
        health: 50
      }, 'gor'); // Use gor signature

      const request = createMockPostRequest('/api/arkana/users/stats', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(400);
      expect(data.error).toContain('must be [arkana]');
    });

    it('should return 400 for invalid UUID format', async () => {
      const body = createApiBody({
        sl_uuid: 'invalid-uuid',
        universe: 'arkana',
        health: 50
      }, 'arkana');

      const request = createMockPostRequest('/api/arkana/users/stats', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(400);
      expect(data.error).toContain('must be a valid GUID');
    });
  });
});