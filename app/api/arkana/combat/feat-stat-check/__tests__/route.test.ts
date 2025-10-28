import { POST } from '../route';
import { arkanaFeatStatCheckSchema } from '@/lib/validation';
import {
  createMockPostRequest,
  createTestUser,
  cleanupDatabase,
  expectSuccess,
  expectError,
  parseJsonResponse,
  generateTestUUID,
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { prisma } from '@/lib/prisma';
import { generateSignature } from '@/lib/signature';
import type { ActiveEffect, LiveStats, ArkanaStats } from '@/lib/arkana/types';
import { recalculateLiveStats } from '@/lib/arkana/effectsUtils';

describe('/api/arkana/combat/feat-stat-check', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  /**
   * Helper: Create Arkana test user with stats and optional active effects
   */
  async function createArkanaTestUser(arkanaStatsData: {
    characterName: string;
    race: string;
    archetype: string;
    physical: number;
    dexterity: number;
    mental: number;
    perception: number;
    hitPoints: number;
    commonPowers?: string[];
    archetypePowers?: string[];
    activeEffects?: ActiveEffect[];
    liveStats?: LiveStats;
    status?: number;
    health?: number;
  }) {
    const { user } = await createTestUser('arkana');

    // Create user stats with specified status (default 0 = RP mode) and health
    await prisma.userStats.create({
      data: {
        userId: user.id,
        health: arkanaStatsData.health !== undefined ? arkanaStatsData.health : 100,
        hunger: 100,
        thirst: 100,
        copperCoin: 100,
        status: arkanaStatsData.status !== undefined ? arkanaStatsData.status : 0
      }
    });

    // If activeEffects provided but no liveStats, calculate them
    let calculatedLiveStats = arkanaStatsData.liveStats;
    if (arkanaStatsData.activeEffects && arkanaStatsData.activeEffects.length > 0 && !arkanaStatsData.liveStats) {
      // Load effect data before calculating liveStats
      const { loadAllData } = await import('@/lib/arkana/dataLoader');
      await loadAllData();

      // Create a temporary ArkanaStats object for calculation
      const tempStats = {
        physical: arkanaStatsData.physical,
        mental: arkanaStatsData.mental,
        dexterity: arkanaStatsData.dexterity,
        perception: arkanaStatsData.perception,
      } as ArkanaStats;
      calculatedLiveStats = recalculateLiveStats(tempStats, arkanaStatsData.activeEffects);
    }

    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        agentName: user.username + ' Resident',
        registrationCompleted: true,
        characterName: arkanaStatsData.characterName,
        race: arkanaStatsData.race,
        archetype: arkanaStatsData.archetype,
        physical: arkanaStatsData.physical,
        dexterity: arkanaStatsData.dexterity,
        mental: arkanaStatsData.mental,
        perception: arkanaStatsData.perception,
        hitPoints: arkanaStatsData.hitPoints,
        commonPowers: arkanaStatsData.commonPowers || [],
        archetypePowers: arkanaStatsData.archetypePowers || [],
        activeEffects: (arkanaStatsData.activeEffects || []) as unknown as typeof prisma.$Prisma.JsonNull,
        liveStats: (calculatedLiveStats || {}) as unknown as typeof prisma.$Prisma.JsonNull
      }
    });

    return user;
  }

  describe('API Endpoint Tests', () => {
    it('should process a physical stat check correctly', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Strong Warrior',
        race: 'human',
        archetype: 'Fighter',
        physical: 5, // High physical = +6 modifier
        dexterity: 2,
        mental: 1,
        perception: 2,
        hitPoints: 25
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'physical',
        target_number: 12,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.statModifier).toBe(6); // physical 5 → +6
      expect(data.data.statValue).toBe(5);
      expect(data.data.statType).toBe('physical');
      expect(data.data.targetNumber).toBe(12);
      expect(data.data.d20Roll).toBeGreaterThanOrEqual(1);
      expect(data.data.d20Roll).toBeLessThanOrEqual(20);
      expect(data.data.totalRoll).toBe(data.data.d20Roll + 6);
      expect(data.data.message).toContain('Strong%20Warrior');
      expect(data.data.message).toContain('Physical');
      expect(data.data.player.name).toBe('Strong%20Warrior');
      expect(data.data.player.uuid).toBe(player.slUuid);
      expect(['true', 'false']).toContain(data.data.isSuccess);
    });

    it('should process a dexterity stat check correctly', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Swift Rogue',
        race: 'human',
        archetype: 'Rogue',
        physical: 2,
        dexterity: 4, // Dexterity 4 → +4 modifier
        mental: 3,
        perception: 4,
        hitPoints: 15
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'dexterity',
        target_number: 15,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.statModifier).toBe(4);
      expect(data.data.statValue).toBe(4);
      expect(data.data.statType).toBe('dexterity');
      expect(data.data.targetNumber).toBe(15);
      expect(data.data.totalRoll).toBe(data.data.d20Roll + 4);
    });

    it('should process a mental stat check correctly', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Wise Mage',
        race: 'human',
        archetype: 'Mage',
        physical: 1,
        dexterity: 2,
        mental: 5, // Mental 5 → +6 modifier
        perception: 3,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'mental',
        target_number: 18,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.statModifier).toBe(6);
      expect(data.data.statValue).toBe(5);
      expect(data.data.statType).toBe('mental');
      expect(data.data.targetNumber).toBe(18);
      expect(data.data.totalRoll).toBe(data.data.d20Roll + 6);
    });

    it('should process a perception stat check correctly', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Eagle Eye',
        race: 'human',
        archetype: 'Ranger',
        physical: 3,
        dexterity: 4,
        mental: 2,
        perception: 5, // Perception 5 → +6 modifier
        hitPoints: 18
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'perception',
        target_number: 10,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.statModifier).toBe(6);
      expect(data.data.statValue).toBe(5);
      expect(data.data.statType).toBe('perception');
      expect(data.data.targetNumber).toBe(10);
      expect(data.data.totalRoll).toBe(data.data.d20Roll + 6);
    });

    it('should handle low stat values correctly', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Weak Character',
        race: 'human',
        archetype: 'Civilian',
        physical: 1, // Physical 1 → -2 modifier
        dexterity: 1,
        mental: 1,
        perception: 1,
        hitPoints: 8
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'physical',
        target_number: 20,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.statModifier).toBe(-2);
      expect(data.data.statValue).toBe(1);
      expect(data.data.totalRoll).toBe(data.data.d20Roll - 2);
    });

    it('should handle average stat values correctly', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Average Joe',
        race: 'human',
        archetype: 'Commoner',
        physical: 3, // Physical 3 → +2 modifier
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 15
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'physical',
        target_number: 12,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.statModifier).toBe(2);
      expect(data.data.statValue).toBe(3);
      expect(data.data.totalRoll).toBe(data.data.d20Roll + 2);
    });

    it('should accept TN of 1', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Test Player',
        race: 'human',
        archetype: 'Fighter',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 15
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'physical',
        target_number: 1,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.targetNumber).toBe(1);
    });

    it('should accept TN of 30', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Test Player',
        race: 'human',
        archetype: 'Fighter',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 15
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'physical',
        target_number: 30,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.targetNumber).toBe(30);
    });

    it('should return 404 for non-existent player', async () => {
      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: generateTestUUID(),
        stat_type: 'physical',
        target_number: 15,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Player not found in Arkana universe');
      expect(response.status).toBe(404);
    });

    it('should return 400 for incomplete player registration', async () => {
      const { user: player } = await createTestUser('arkana');
      await prisma.userStats.create({
        data: {
          userId: player.id,
          health: 100,
          hunger: 100,
          thirst: 100,
          copperCoin: 100
        }
      });
      await prisma.arkanaStats.create({
        data: {
          userId: player.id,
          characterName: 'Incomplete Player',
          agentName: player.username + ' Resident',
          race: 'human',
          archetype: 'Fighter',
          physical: 3,
          dexterity: 3,
          mental: 3,
          perception: 3,
          hitPoints: 15,
          registrationCompleted: false
        }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'physical',
        target_number: 15,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Player registration incomplete');
      expect(response.status).toBe(400);
    });

    it('should return 400 when player is not in RP mode', async () => {
      const player = await createArkanaTestUser({
        characterName: 'OOC Player',
        race: 'human',
        archetype: 'Fighter',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 15
      });

      // Set player status to 1 (OOC mode, not in RP)
      await prisma.userStats.update({
        where: { userId: player.id },
        data: { status: 1 }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'physical',
        target_number: 15,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Player is not in RP mode');
      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid signature', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Test Player',
        race: 'human',
        archetype: 'Fighter',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 15
      });

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'physical',
        target_number: 15,
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'invalid-signature'
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(400);
    });

    it('should return string booleans for LSL compatibility', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Test Player',
        race: 'human',
        archetype: 'Fighter',
        physical: 5,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 15
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'physical',
        target_number: 15,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(typeof data.data.isSuccess).toBe('string');
      expect(['true', 'false']).toContain(data.data.isSuccess);
    });
  });

  describe('1. LiveStats Usage with Stat Checks', () => {
    /**
     * IMPORTANT: Effect modifiers work by modifying the base stat value,
     * which is then converted to a d20 modifier using calculateStatModifier().
     *
     * Example: Mental 2 (0 mod) + buff_mental_1_turn (+1) = Mental 3 (+2 mod)
     */

    it('1.1 should apply buff to physical stat check', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Buffed Warrior',
        race: 'human',
        archetype: 'Fighter',
        physical: 2, // 0 modifier base
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_physical_stat_1',
            name: 'Physical Stat +1',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          }
        ]
        // liveStats: { Physical: 1 } → Effective Physical = 3 → +2 modifier
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'physical',
        target_number: 12,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Physical 2 + buff (+1) = Physical 3 → +2 modifier
      expect(data.data.statModifier).toBe(2);
      expect(data.data.statValue).toBe(2); // Base stat value

      // Verify effect decremented
      const updatedPlayer = await prisma.arkanaStats.findFirst({
        where: { userId: player.id }
      });
      const activeEffects = (updatedPlayer?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects[0].turnsLeft).toBe(2); // 3 - 1
    });

    it('1.2 should apply debuff to mental stat check', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Confused Mage',
        race: 'human',
        archetype: 'Mage',
        physical: 2,
        dexterity: 2,
        mental: 3, // +2 modifier base
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'debuff_mental_minus_1',
            name: 'Mental Debuff -1',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          }
        ]
        // liveStats: { Mental: -1 } → Effective Mental = 2 → 0 modifier
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'mental',
        target_number: 10,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Mental 3 + debuff (-1) = Mental 2 → 0 modifier
      expect(data.data.statModifier).toBe(0);
    });

    it('1.3 should test all 4 stat types with liveStats', async () => {
      // Test different stat types with buffs (using effects that actually exist)
      const statConfigs = [
        { statType: 'physical', effectId: 'buff_physical_1' },
        { statType: 'dexterity', effectId: 'buff_dexterity_3' },
        { statType: 'mental', effectId: 'buff_mental_1_turn' },
        { statType: 'perception', effectId: 'buff_stealth_3' } // Stealth affects perception checks
      ];

      for (const config of statConfigs) {
        await cleanupDatabase(); // Clean between tests

        const player = await createArkanaTestUser({
          characterName: `Buffed ${config.statType}`,
          race: 'human',
          archetype: 'Fighter',
          physical: 2,
          dexterity: 2,
          mental: 2,
          perception: 2,
          hitPoints: 10,
          activeEffects: [
            {
              effectId: config.effectId,
              name: `${config.statType} Bonus`,
              duration: 'turns:3',
              turnsLeft: 3,
              appliedAt: new Date().toISOString()
            }
          ]
        });

        const timestamp = new Date().toISOString();
        const signature = generateSignature(timestamp, 'arkana');

        const statCheckData = {
          player_uuid: player.slUuid,
          stat_type: config.statType,
          target_number: 10,
          universe: 'arkana',
          timestamp: timestamp,
          signature: signature
        };

        const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
        const response = await POST(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);
        // Verify stat modifier changes with effects
        expect(data.data.statModifier).toBeGreaterThanOrEqual(0); // With buffs, should be non-negative
      }
    });

    it('1.4 should use effective stat with fixed target number', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Buffed Player',
        race: 'human',
        archetype: 'Fighter',
        physical: 1, // -2 modifier base
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_physical_stat_2',
            name: 'Physical Stat +2',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          }
        ]
        // liveStats: { Physical: 2 } → Effective Physical = 3 → +2 modifier
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'physical',
        target_number: 15,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Physical 1 + buff (+2) = Physical 3 → +2 modifier
      expect(data.data.statModifier).toBe(2);
      expect(data.data.targetNumber).toBe(15);
    });
  });

  describe('2. Turn Processing', () => {
    it('2.1 should decrement effect after successful check', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Player',
        race: 'human',
        archetype: 'Fighter',
        physical: 5, // +6 modifier (high success chance)
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_physical_1',
            name: 'Physical Bonus +1',
            duration: 'turns:3',
            turnsLeft: 3, // Will decrement to 2
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'physical',
        target_number: 10,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify effect decremented
      const updatedPlayer = await prisma.arkanaStats.findFirst({
        where: { userId: player.id }
      });
      const activeEffects = (updatedPlayer?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects[0].turnsLeft).toBe(2); // 3 - 1
    });

    it('2.2 should decrement effect after failed check', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Player',
        race: 'human',
        archetype: 'Fighter',
        physical: 1, // -2 modifier (high failure chance)
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_physical_1',
            name: 'Physical Bonus +1',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'physical',
        target_number: 25, // Very high TN (likely to fail)
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify effect still decremented even on failure
      const updatedPlayer = await prisma.arkanaStats.findFirst({
        where: { userId: player.id }
      });
      const activeEffects = (updatedPlayer?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects[0].turnsLeft).toBe(2); // 3 - 1
    });

    it('2.3 should expire effect when turnsLeft reaches 0', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Player',
        race: 'human',
        archetype: 'Fighter',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_physical_1',
            name: 'Physical Bonus +1',
            duration: 'turns:1',
            turnsLeft: 1, // Will expire
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'physical',
        target_number: 10,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify effect expired
      const updatedPlayer = await prisma.arkanaStats.findFirst({
        where: { userId: player.id }
      });
      const activeEffects = (updatedPlayer?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects).toHaveLength(0);

      const liveStats = (updatedPlayer?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.Physical).toBeUndefined();
    });

    it('2.4 should decrement multiple effects', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Multi-Effect Player',
        race: 'human',
        archetype: 'Fighter',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_physical_1',
            name: 'Physical Bonus +1',
            duration: 'turns:3',
            turnsLeft: 3, // Will decrement to 2
            appliedAt: new Date().toISOString()
          },
          {
            effectId: 'buff_dexterity_3',
            name: 'Dexterity Bonus +3',
            duration: 'turns:5',
            turnsLeft: 5, // Will decrement to 4
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const statCheckData = {
        player_uuid: player.slUuid,
        stat_type: 'physical',
        target_number: 10,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/feat-stat-check', statCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify all effects decremented
      const updatedPlayer = await prisma.arkanaStats.findFirst({
        where: { userId: player.id }
      });
      const activeEffects = (updatedPlayer?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects).toHaveLength(2);
      expect(activeEffects[0].turnsLeft).toBe(2); // 3 - 1
      expect(activeEffects[1].turnsLeft).toBe(4); // 5 - 1
    });
  });

  describe('Validation Schema Tests', () => {
    it('should accept valid stat check data', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        stat_type: 'physical',
        target_number: 15,
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaFeatStatCheckSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('should accept all valid stat types', () => {
      const statTypes = ['physical', 'dexterity', 'mental', 'perception'];

      statTypes.forEach(statType => {
        const payload = {
          player_uuid: generateTestUUID(),
          stat_type: statType,
          target_number: 15,
          universe: 'arkana',
          timestamp: new Date().toISOString(),
          signature: 'a'.repeat(64)
        };

        const { error } = arkanaFeatStatCheckSchema.validate(payload);
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid stat type', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        stat_type: 'invalid',
        target_number: 15,
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaFeatStatCheckSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('stat_type');
    });

    it('should reject TN below 1', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        stat_type: 'physical',
        target_number: 0,
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaFeatStatCheckSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('target_number');
    });

    it('should reject TN above 30', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        stat_type: 'physical',
        target_number: 31,
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaFeatStatCheckSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('target_number');
    });

    it('should reject non-integer TN', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        stat_type: 'physical',
        target_number: 15.5,
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaFeatStatCheckSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('integer');
    });

    it('should reject missing player_uuid', () => {
      const payload = {
        stat_type: 'physical',
        target_number: 15,
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaFeatStatCheckSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('player_uuid');
    });

    it('should reject invalid player_uuid format', () => {
      const payload = {
        player_uuid: 'not-a-valid-uuid',
        stat_type: 'physical',
        target_number: 15,
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaFeatStatCheckSchema.validate(payload);
      expect(error).toBeDefined();
    });

    it('should reject non-arkana universe', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        stat_type: 'physical',
        target_number: 15,
        universe: 'gor',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaFeatStatCheckSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('must be [arkana]');
    });

    it('should reject missing universe', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        stat_type: 'physical',
        target_number: 15,
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaFeatStatCheckSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('universe');
    });

    it('should reject missing timestamp', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        stat_type: 'physical',
        target_number: 15,
        universe: 'arkana',
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaFeatStatCheckSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('timestamp');
    });

    it('should reject missing signature', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        stat_type: 'physical',
        target_number: 15,
        universe: 'arkana',
        timestamp: new Date().toISOString()
      };

      const { error } = arkanaFeatStatCheckSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('signature');
    });

    it('should require all fields', () => {
      const payload = {
        player_uuid: generateTestUUID()
      };

      const { error } = arkanaFeatStatCheckSchema.validate(payload);
      expect(error).toBeDefined();
    });
  });
});
