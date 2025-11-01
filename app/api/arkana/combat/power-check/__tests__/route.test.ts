import { POST } from '../route';
import { arkanaPowerCheckSchema } from '@/lib/validation';
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

describe('/api/arkana/combat/power-check', () => {
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
    it('should process a power check correctly for high mental stat', async () => {
      // Create player with high mental stat
      const player = await createArkanaTestUser({
        characterName: 'Powerful Psion',
        race: 'human',
        archetype: 'Mentalist',
        physical: 2,
        dexterity: 2,
        mental: 5, // High mental = +2 modifier
        perception: 3,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const powerCheckData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.mentalMod).toBe(6); // mental 5 → +6 (from calculateStatModifier)
      expect(data.data.mentalStat).toBe(5);
      expect(data.data.targetNumber).toBe(12); // Always 12 for power checks
      expect(data.data.d20Roll).toBeGreaterThanOrEqual(1);
      expect(data.data.d20Roll).toBeLessThanOrEqual(20);
      expect(data.data.totalRoll).toBe(data.data.d20Roll + 6); // d20 + mental mod (+6)
      expect(data.data.message).toContain('Powerful%20Psion');
      expect(data.data.player.name).toBe('Powerful%20Psion');
      expect(data.data.player.uuid).toBe(player.slUuid);
      // isSuccess should be a string "true" or "false" for LSL compatibility
      expect(['true', 'false']).toContain(data.data.isSuccess);
    });

    it('should process a power check correctly for low mental stat', async () => {
      // Create player with low mental stat
      const player = await createArkanaTestUser({
        characterName: 'Weak Mind',
        race: 'human',
        archetype: 'Fighter',
        physical: 5,
        dexterity: 3,
        mental: 1, // Low mental = -2 modifier
        perception: 2,
        hitPoints: 25
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const powerCheckData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.mentalMod).toBe(-2); // mental 1 - 3 = -2
      expect(data.data.mentalStat).toBe(1);
      expect(data.data.targetNumber).toBe(12);
      expect(data.data.totalRoll).toBe(data.data.d20Roll - 2);
      expect(['true', 'false']).toContain(data.data.isSuccess);
    });

    it('should process a power check correctly for average mental stat', async () => {
      // Create player with average mental stat
      const player = await createArkanaTestUser({
        characterName: 'Average Joe',
        race: 'human',
        archetype: 'Rogue',
        physical: 3,
        dexterity: 4,
        mental: 3, // Average mental = 0 modifier
        perception: 3,
        hitPoints: 15
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const powerCheckData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.mentalMod).toBe(2); // mental 3 → +2 (from calculateStatModifier)
      expect(data.data.mentalStat).toBe(3);
      expect(data.data.targetNumber).toBe(12);
      expect(data.data.totalRoll).toBe(data.data.d20Roll + 2); // d20 + mental mod (+2)
    });

    it('should return 404 for non-existent player', async () => {
      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const powerCheckData = {
        player_uuid: generateTestUUID(), // Non-existent UUID
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
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
          archetype: 'Mage',
          physical: 2,
          dexterity: 2,
          mental: 4,
          perception: 3,
          hitPoints: 10,
          registrationCompleted: false // Not completed!
        }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const powerCheckData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Player registration incomplete');
      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid signature', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Test Player',
        race: 'human',
        archetype: 'Mage',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10
      });

      const powerCheckData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'invalid-signature'
      };

      const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(400); // Should be 400 for validation error
    });

    it('should verify target number is always 12', async () => {
      // Create multiple players with different mental stats
      const players = await Promise.all([
        createArkanaTestUser({
          characterName: 'Player 1',
          race: 'human',
          archetype: 'Fighter',
          physical: 5,
          dexterity: 3,
          mental: 1,
          perception: 2,
          hitPoints: 25
        }),
        createArkanaTestUser({
          characterName: 'Player 2',
          race: 'human',
          archetype: 'Mage',
          physical: 2,
          dexterity: 2,
          mental: 5,
          perception: 4,
          hitPoints: 10
        }),
        createArkanaTestUser({
          characterName: 'Player 3',
          race: 'human',
          archetype: 'Rogue',
          physical: 3,
          dexterity: 4,
          mental: 3,
          perception: 3,
          hitPoints: 15
        })
      ]);

      for (const player of players) {
        const timestamp = new Date().toISOString();
        const signature = generateSignature(timestamp, 'arkana');

        const powerCheckData = {
          player_uuid: player.slUuid,
          universe: 'arkana',
          timestamp: timestamp,
          signature: signature
        };

        const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
        const response = await POST(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);
        expect(data.data.targetNumber).toBe(12); // Always 12, regardless of mental stat
      }
    });

    it('should return string booleans for LSL compatibility', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Test Player',
        race: 'human',
        archetype: 'Mage',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const powerCheckData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // isSuccess must be a string, not a boolean, for LSL JSON parsing
      expect(typeof data.data.isSuccess).toBe('string');
      expect(['true', 'false']).toContain(data.data.isSuccess);
    });
  });

  describe('1. LiveStats Usage with Power Checks', () => {
    /**
     * IMPORTANT: Effect modifiers work by modifying the base stat value,
     * which is then converted to a d20 modifier using calculateStatModifier().
     *
     * Power checks use Mental stat exclusively with fixed TN of 12.
     * Example: Mental 2 (0 mod) + buff_mental_1_turn (+1) = Mental 3 (+2 mod)
     */

    it('1.1 should apply mental buff to power check', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Buffed Psion',
        race: 'human',
        archetype: 'Mentalist',
        physical: 2,
        dexterity: 2,
        mental: 2, // 0 modifier base
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_mental_stat_1',
            name: 'Mental Stat +1',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          }
        ]
        // liveStats: { Mental: 1 } → Effective Mental = 3 → +2 modifier
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const powerCheckData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Mental 2 + buff (+1) = Mental 3 → +2 modifier
      expect(data.data.mentalMod).toBe(2);
      expect(data.data.mentalStat).toBe(2); // Base stat value

      // Verify effect decremented
      const updatedPlayer = await prisma.arkanaStats.findFirst({
        where: { userId: player.id }
      });
      const activeEffects = (updatedPlayer?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects[0].turnsLeft).toBe(2); // 3 - 1
    });

    it('1.2 should apply mental debuff to power check', async () => {
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

      const powerCheckData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Mental 3 + debuff (-1) = Mental 2 → 0 modifier
      expect(data.data.mentalMod).toBe(0);
    });

    it('1.3 should stack multiple mental modifiers', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Multi-Buffed Psion',
        race: 'human',
        archetype: 'Mentalist',
        physical: 2,
        dexterity: 2,
        mental: 1, // -2 modifier base
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_mental_stat_1',
            name: 'Mental Stat +1',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          },
          {
            effectId: 'buff_mental_stat_2',
            name: 'Mental Focus',
            duration: 'turns:2',
            turnsLeft: 2,
            appliedAt: new Date().toISOString()
          }
        ]
        // liveStats: { Mental: 3 } → Effective Mental = 4 → +4 modifier
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const powerCheckData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Mental 1 + buff1 (+1) + buff2 (+2) = Mental 4 → +4 modifier
      expect(data.data.mentalMod).toBe(4);
    });

    it('1.4 should maintain TN of 12 regardless of modifiers', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Buffed Player',
        race: 'human',
        archetype: 'Mage',
        physical: 2,
        dexterity: 2,
        mental: 5, // +6 modifier base
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_mental_1_turn',
            name: 'Mental Bonus +1 (1 turn)',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const powerCheckData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // TN is always 12 for power checks
      expect(data.data.targetNumber).toBe(12);
      // Mental stat recorded is base stat value
      expect(data.data.mentalStat).toBe(5);
    });

    /**
     * Roll Bonus Modifiers Tests (Section 1.5)
     * roll_bonus modifierType adds/subtracts AFTER tier calculation (linear effect)
     * Power checks use Mental stat exclusively with fixed TN of 12.
     * Example: Mental[2](+0 tier) + roll_bonus(+2) = final +2 modifier
     */
    it('1.5.1 should apply positive roll_bonus modifier to power check', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Focused Psion',
        race: 'human',
        archetype: 'Mentalist',
        physical: 2,
        dexterity: 2,
        mental: 2, // 0 modifier base (tier)
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_mental_roll_2',
            name: 'Mental Focus +2',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          }
        ]
        // liveStats auto-calculated: { Mental_rollbonus: 2 } → Effective mod = 0 (tier) + 2 (roll) = +2
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const powerCheckData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Mental[2](+0 tier) + roll_bonus(+2) = +2 final modifier
      expect(data.data.mentalMod).toBe(2);

      // Verify liveStats stored correctly
      const updatedPlayer = await prisma.arkanaStats.findFirst({
        where: { userId: player.id }
      });
      const liveStats = (updatedPlayer?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.Mental_rollbonus).toBe(2);
      expect(liveStats.Mental).toBeUndefined(); // No stat_value modifier
    });

    it('1.5.2 should apply negative roll_bonus modifier (debuff) to power check', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Distracted Mage',
        race: 'human',
        archetype: 'Mage',
        physical: 2,
        dexterity: 2,
        mental: 3, // +2 modifier base (tier)
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'debuff_mental_roll_minus_2',
            name: 'Mental Roll Penalty -2',
            duration: 'turns:2',
            turnsLeft: 2,
            appliedAt: new Date().toISOString()
          }
        ]
        // liveStats: { Mental_rollbonus: -2 } → Effective mod = +2 (tier) + (-2) (roll) = 0
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const powerCheckData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Mental[3](+2 tier) + roll_penalty(-2) = 0 final modifier
      expect(data.data.mentalMod).toBe(0);

      const updatedPlayer = await prisma.arkanaStats.findFirst({
        where: { userId: player.id }
      });
      const liveStats = (updatedPlayer?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.Mental_rollbonus).toBe(-2);
    });

    it('1.5.3 should combine stat_value and roll_bonus modifiers correctly for power check', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Combined Buffs Mage',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 2,
        mental: 2, // 0 modifier base (tier)
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_mental_stat_1',
            name: 'Mental Stat +1',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          },
          {
            effectId: 'buff_mental_roll_2',
            name: 'Mental Focus +2',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          }
        ]
        // liveStats: { Mental: 1, Mental_rollbonus: 2 }
        // → Effective Mental = 2 + 1 = 3 → +2 tier mod, then +2 roll bonus = +4 total
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const powerCheckData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Mental: (2 + 1) = 3 → +2 tier mod, then +2 roll bonus = +4 total
      expect(data.data.mentalMod).toBe(4);

      const updatedPlayer = await prisma.arkanaStats.findFirst({
        where: { userId: player.id }
      });
      const liveStats = (updatedPlayer?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.Mental).toBe(1); // stat_value modifier
      expect(liveStats.Mental_rollbonus).toBe(2); // roll_bonus modifier
    });
  });

  describe('2. Turn Processing', () => {
    it('2.1 should decrement effect after successful check', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Player',
        race: 'human',
        archetype: 'Mage',
        physical: 2,
        dexterity: 2,
        mental: 5, // +6 modifier (high success chance)
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_mental_1_turn',
            name: 'Mental Bonus +1 (1 turn)',
            duration: 'turns:3',
            turnsLeft: 3, // Will decrement to 2
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const powerCheckData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
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
        physical: 5,
        dexterity: 2,
        mental: 1, // -2 modifier (high failure chance against TN 12)
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_mental_1_turn',
            name: 'Mental Bonus +1 (1 turn)',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const powerCheckData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
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
        archetype: 'Mage',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_mental_1_turn',
            name: 'Mental Bonus +1 (1 turn)',
            duration: 'turns:1',
            turnsLeft: 1, // Will expire
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const powerCheckData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
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
      expect(liveStats.Mental).toBeUndefined();
    });

    it('2.4 should handle multiple successive power checks', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Multi-Check Player',
        race: 'human',
        archetype: 'Mage',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_mental_1_turn',
            name: 'Mental Bonus +1 (1 turn)',
            duration: 'turns:5',
            turnsLeft: 5, // Start at 5
            appliedAt: new Date().toISOString()
          }
        ]
      });

      // Perform 3 power checks sequentially
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay for timestamp
        const timestamp = new Date().toISOString();
        const signature = generateSignature(timestamp, 'arkana');

        const powerCheckData = {
          player_uuid: player.slUuid,
          universe: 'arkana',
          timestamp: timestamp,
          signature: signature
        };

        const request = createMockPostRequest('/api/arkana/combat/power-check', powerCheckData);
        const response = await POST(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);

        // Verify effect correctly decremented
        const updatedPlayer = await prisma.arkanaStats.findFirst({
          where: { userId: player.id }
        });
        const activeEffects = (updatedPlayer?.activeEffects || []) as unknown as ActiveEffect[];
        expect(activeEffects[0].turnsLeft).toBe(5 - (i + 1)); // 5 - turns elapsed
      }
    });
  });

  describe('Validation Schema Tests', () => {
    it('should accept valid power check data', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64) // Valid 64-char hex signature
      };

      const { error } = arkanaPowerCheckSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('should reject missing player_uuid', () => {
      const payload = {
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerCheckSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('player_uuid');
    });

    it('should reject invalid player_uuid format', () => {
      const payload = {
        player_uuid: 'not-a-valid-uuid',
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerCheckSchema.validate(payload);
      expect(error).toBeDefined();
    });

    it('should reject non-arkana universe', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        universe: 'gor',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerCheckSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('must be [arkana]');
    });

    it('should reject missing universe', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerCheckSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('universe');
    });

    it('should reject missing timestamp', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        universe: 'arkana',
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerCheckSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('timestamp');
    });

    it('should reject missing signature', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        universe: 'arkana',
        timestamp: new Date().toISOString()
      };

      const { error } = arkanaPowerCheckSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('signature');
    });

    it('should require all fields', () => {
      const payload = {
        player_uuid: generateTestUUID()
        // Missing universe, timestamp, signature
      };

      const { error } = arkanaPowerCheckSchema.validate(payload);
      expect(error).toBeDefined();
    });
  });
});
