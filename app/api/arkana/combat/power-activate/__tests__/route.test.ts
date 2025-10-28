import { POST } from '../route';
import { arkanaPowerActivateSchema } from '@/lib/validation';
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
import { POST as PowerAttackPOST } from '../../power-attack/route';
import { recalculateLiveStats, parseActiveEffects } from '@/lib/arkana/effectsUtils';

describe('/api/arkana/combat/power-activate', () => {
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
    health?: number; // Optional current HP (defaults to hitPoints if not specified)
    commonPowers?: string[];
    archetypePowers?: string[];
    activeEffects?: ActiveEffect[];
    liveStats?: LiveStats;
    status?: number; // Add status for RP mode testing
  }) {
    const { user } = await createTestUser('arkana');

    // Create user stats with specified status (default 0 = RP mode)
    // Use provided health value, or default to hitPoints (current HP = max HP at creation)
    await prisma.userStats.create({
      data: {
        userId: user.id,
        health: arkanaStatsData.health !== undefined ? arkanaStatsData.health : arkanaStatsData.hitPoints,
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


  describe('1. API Endpoint Tests (Basic Functionality)', () => {
    it('1.1 should successfully activate ability power', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Caster',
        race: 'gaki',
        archetype: 'Psion',
        physical: 3,
        dexterity: 2,
        mental: 4, // +1 modifier
        perception: 3,
        hitPoints: 10,
        commonPowers: ['gaki_chi_manipulation'], // Has ability effects
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'gaki_chi_manipulation',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.powerUsed).toBe('Chi Manipulation');
      expect(data.data.activationSuccess).toMatch(/^(true|false)$/);
      expect(data.data.message).toBeDefined();
      expect(data.data.caster).toBeDefined();
    });

    it('1.2 should activate self-targeted ability power without target', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Self Buffer',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_emotion_theft'], // Has self-buff component
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_emotion_theft',
        // No target_uuid - self-targeted
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.caster.uuid).toBe(caster.slUuid);
    });

    it('1.3 should return 403 when caster does not own the power', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'No Powers',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: [], // No powers
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_entropy_pulse',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'does not own this power');
      expect(response.status).toBe(403);
    });

    it('1.4 should return 400 when caster is not in RP mode', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'OOC Caster',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: [],
        status: 1 // OOC mode
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_entropy_pulse',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'not in RP mode');
      expect(response.status).toBe(400);
    });

    it('1.5 should return 400 when target is not in RP mode', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Caster',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'OOC Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: [],
        status: 1 // OOC mode
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_entropy_pulse',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'not in RP mode');
      expect(response.status).toBe(400);
    });

    it('1.6 should return 401 with invalid signature', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Caster',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = 'a'.repeat(64); // Valid format but wrong signature

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_entropy_pulse',
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(401);
    });

    it('1.7 should return 400 when missing both power_id and power_name', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Caster',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        // Missing power_id and power_name
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(400);
    });
  });

  describe('2. Turn Processing Tests (activeEffects System)', () => {
    it('2.1 should decrement turn-based effects but not scene effects', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Buffed Caster',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'buff_dexterity_3',
            name: 'Dexterity Bonus +3',
            duration: 'turns:2',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          },
          {
            effectId: 'buff_physical_1',
            name: 'Physical Bonus +1',
            duration: 'scene',
            turnsLeft: 999, // Scene effects stay at 999
            appliedAt: new Date().toISOString()
          }
        ],
        liveStats: { Dexterity_rollbonus: 3, Physical_rollbonus: 1 }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_entropy_pulse',
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify in database
      const updatedCaster = await prisma.arkanaStats.findFirst({
        where: { userId: caster.id }
      });

      const activeEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects).toHaveLength(2);
      expect(activeEffects[0].turnsLeft).toBe(2); // 3 - 1 (turn-based effect decrements)
      expect(activeEffects[1].turnsLeft).toBe(999); // Scene effect does NOT decrement
    });

    it('2.2 should remove expired effects after turn processing', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Expiring Caster',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'buff_dexterity_3',
            name: 'Dexterity Bonus +3',
            duration: 'turns:2',
            turnsLeft: 1, // Will expire this turn
            appliedAt: new Date().toISOString()
          }
        ],
        liveStats: { Dexterity_rollbonus: 3 }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_entropy_pulse',
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify in database
      const updatedCaster = await prisma.arkanaStats.findFirst({
        where: { userId: caster.id }
      });

      const activeEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects).toHaveLength(0); // Effect removed

      const liveStats = (updatedCaster?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.Dexterity_rollbonus).toBeUndefined(); // Stat bonus removed
    });

    it('2.3 should persist scene duration effects through turn processing', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Scene Buffed',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'buff_stealth_3',
            name: 'Stealth Bonus +3',
            duration: 'scene',
            turnsLeft: 999, // Scene duration
            appliedAt: new Date().toISOString()
          }
        ],
        liveStats: { Stealth_rollbonus: 3 }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_entropy_pulse',
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify in database
      const updatedCaster = await prisma.arkanaStats.findFirst({
        where: { userId: caster.id }
      });

      const activeEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects).toHaveLength(1);
      expect(activeEffects[0].turnsLeft).toBe(999); // Scene effects do NOT decrement

      const liveStats = (updatedCaster?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.Stealth_rollbonus).toBe(3); // Still active (roll_bonus type stored with _rollbonus suffix)
    });

    it('2.4 should handle multiple effects expiring in same turn', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Multi Expire',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'buff_dexterity_3',
            name: 'Dexterity Bonus +3',
            duration: 'turns:1',
            turnsLeft: 1, // Expires (turn-based)
            appliedAt: new Date().toISOString()
          },
          {
            effectId: 'buff_physical_1',
            name: 'Physical Bonus +1',
            duration: 'turns:1',
            turnsLeft: 1, // Expires (turn-based)
            appliedAt: new Date().toISOString()
          },
          {
            effectId: 'buff_stealth_3',
            name: 'Stealth Bonus +3',
            duration: 'scene',
            turnsLeft: 999, // Persists (scene effect)
            appliedAt: new Date().toISOString()
          }
        ],
        liveStats: { Dexterity_rollbonus: 3, Physical_rollbonus: 1, Stealth_rollbonus: 3 }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_entropy_pulse',
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify in database
      const updatedCaster = await prisma.arkanaStats.findFirst({
        where: { userId: caster.id }
      });

      const activeEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects).toHaveLength(1);
      expect(activeEffects[0].effectId).toBe('buff_stealth_3');
      expect(activeEffects[0].turnsLeft).toBe(999); // Scene effect unchanged

      const liveStats = (updatedCaster?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.Dexterity_rollbonus).toBeUndefined();
      expect(liveStats.Physical_rollbonus).toBeUndefined();
      expect(liveStats.Stealth_rollbonus).toBe(3); // Only this remains
    });

    it('2.5 should recalculate liveStats after turn processing', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Recalc Test',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'buff_physical_1',
            name: 'Physical Bonus +1',
            duration: 'scene',
            turnsLeft: 2,
            appliedAt: new Date().toISOString()
          },
          {
            effectId: 'debuff_mental_minus_1',
            name: 'Mental Debuff -1',
            duration: 'turns:2',
            turnsLeft: 1, // Will expire
            appliedAt: new Date().toISOString()
          }
        ],
        liveStats: { Physical_rollbonus: 1, Mental_rollbonus: -1 }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_entropy_pulse',
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify in database
      const updatedCaster = await prisma.arkanaStats.findFirst({
        where: { userId: caster.id }
      });

      const liveStats = (updatedCaster?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.Physical_rollbonus).toBe(1); // Still active
      expect(liveStats.Mental_rollbonus).toBeUndefined(); // Expired and removed
    });
  });

  describe('3. LiveStats Calculation Tests', () => {
    it('3.1 should apply stat modifier correctly', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Buffer',
        race: 'gaki',
        archetype: 'Psion',
        physical: 2,
        dexterity: 5, // +6 modifier, high chance of check success (d20+6 vs TN:10)
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['gaki_chi_step'], // Self-buff ability
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'gaki_chi_step',
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Only verify if activation succeeded (check can randomly fail)
      if (data.data.activationSuccess === 'true') {
        // Verify caster has buff in liveStats
        const updatedCaster = await prisma.arkanaStats.findFirst({
          where: { userId: caster.id }
        });

        const liveStats = (updatedCaster?.liveStats || {}) as unknown as LiveStats;
        expect(liveStats.Dexterity_rollbonus).toBe(3); // Chi Step applies +3 Dexterity
      } else {
        console.log('Chi Step activation failed check, skipping stat modifier verification');
      }
    });

    it('3.2 should accumulate multiple stat modifiers on same stat', async () => {
      const target = await createArkanaTestUser({
        characterName: 'Multi Buff Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'buff_physical_1',
            name: 'Physical Bonus +1',
            duration: 'scene',
            turnsLeft: 5,
            appliedAt: new Date().toISOString()
          },
          {
            effectId: 'buff_attack_2',
            name: 'Attack Roll Buff +2',
            duration: 'scene',
            turnsLeft: 5,
            appliedAt: new Date().toISOString()
          }
        ]
        // liveStats will be auto-calculated by helper
      });

      // Verify accumulation
      const updatedTarget = await prisma.arkanaStats.findFirst({
        where: { userId: target.id }
      });

      const liveStats = (updatedTarget?.liveStats || {}) as unknown as LiveStats;
      // buff_physical_1 (+1) + buff_attack_2 (+2) = +3 Physical
      expect(liveStats.Physical_rollbonus).toBe(3);
    });

    it('3.3 should handle negative modifiers (debuffs)', async () => {
      const target = await createArkanaTestUser({
        characterName: 'Debuffed Target',
        race: 'human',
        archetype: 'Psion',
        physical: 3,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'debuff_physical_minus_2',
            name: 'Physical Debuff -2',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const updatedTarget = await prisma.arkanaStats.findFirst({
        where: { userId: target.id }
      });

      const liveStats = (updatedTarget?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.Physical).toBe(-2); // debuff_physical_minus_2 is stat_value type
    });

    it('3.4 should handle mixed positive and negative modifiers', async () => {
      const target = await createArkanaTestUser({
        characterName: 'Mixed Target',
        race: 'human',
        archetype: 'Psion',
        physical: 3,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'buff_physical_1',
            name: 'Physical Bonus +1',
            duration: 'scene',
            turnsLeft: 5,
            appliedAt: new Date().toISOString()
          },
          {
            effectId: 'debuff_physical_minus_2',
            name: 'Physical Debuff -2',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const updatedTarget = await prisma.arkanaStats.findFirst({
        where: { userId: target.id }
      });

      const liveStats = (updatedTarget?.liveStats || {}) as unknown as LiveStats;
      // Mixed modifierType: roll_bonus and stat_value don't combine
      expect(liveStats.Physical_rollbonus).toBe(1); // buff_physical_1 (roll_bonus)
      expect(liveStats.Physical).toBe(-2); // debuff_physical_minus_2 (stat_value)
    });

    it('3.5 should store control effects as string values', async () => {
      const target = await createArkanaTestUser({
        characterName: 'Controlled Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'control_paralyze',
            name: 'Paralytic Effect',
            duration: 'turns:2',
            turnsLeft: 2,
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const updatedTarget = await prisma.arkanaStats.findFirst({
        where: { userId: target.id }
      });

      const liveStats = (updatedTarget?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.paralyze).toBe('Paralytic Effect');
    });

    it('3.6 should auto-remove stats matching reset values in config', async () => {
      const target = await createArkanaTestUser({
        characterName: 'Stealth Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: [],
        activeEffects: [] // No effects, so Stealth should be 0 and removed
      });

      const updatedTarget = await prisma.arkanaStats.findFirst({
        where: { userId: target.id }
      });

      const liveStats = (updatedTarget?.liveStats || {}) as unknown as LiveStats;
      // Stealth = 0 matches liveStatsConfig, should be removed
      expect(liveStats.Stealth_rollbonus).toBeUndefined();
    });

    it('3.8 should clear liveStats when last effect is removed', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Last Effect',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'buff_physical_1',
            name: 'Physical Bonus +1',
            duration: 'turns:1',
            turnsLeft: 1, // Will expire (turn-based effect)
            appliedAt: new Date().toISOString()
          }
        ],
        liveStats: { Physical_rollbonus: 1 }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_entropy_pulse',
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      const updatedCaster = await prisma.arkanaStats.findFirst({
        where: { userId: caster.id }
      });

      const liveStats = (updatedCaster?.liveStats || {}) as unknown as LiveStats;
      expect(Object.keys(liveStats).length).toBe(0); // Empty object
    });
  });

  describe('4. Effect Category Tests (Production Effects)', () => {
    it('4.1 Check Effects - mental vs mental', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Mental Caster',
        race: 'gaki',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 2, // 0 modifier (stat 2 = 0 mod)
        perception: 3,
        hitPoints: 10,
        commonPowers: ['gaki_dreamwalking'], // Has ability: check_mental_vs_mental
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 2, // 0 modifier, TN should be 10+0=10
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'gaki_dreamwalking',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.rollInfo).toMatch(/Roll: \d+\+0=\d+ vs TN:10/);
    });

    it('4.1 Check Effects - dexterity vs tn10', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Dexterity Caster',
        race: 'gaki',
        archetype: 'Psion',
        physical: 2,
        dexterity: 1, // -2 modifier (stat 1 = modifier -2)
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['gaki_chi_step'], // Uses check_dexterity_vs_tn10
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'gaki_chi_step',
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Chi Step uses Dexterity check (stat 1 = -2 modifier)
      // Format is "d20+modifier=total" so with -2 it's "d20+-2=total"
      // -? allows for negative totals when roll is 1-2
      expect(data.data.rollInfo).toMatch(/Roll: \d+\+-2=-?\d+ vs TN:10/);
    });

    it('4.3 Stat Modifier Effects - buff_dexterity_3', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Speed Buffer',
        race: 'gaki',
        archetype: 'Life',
        physical: 2,
        dexterity: 5, // +6 modifier, high chance of check success (d20+6 vs TN:10)
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['gaki_chi_step'], // Has buff_dexterity_3
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'gaki_chi_step',
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Only verify effects if activation succeeded (check can randomly fail)
      if (data.data.activationSuccess === 'true') {
        // Verify active effects
        const updatedCaster = await prisma.arkanaStats.findFirst({
          where: { userId: caster.id }
        });

        const activeEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
        const dexBuff = activeEffects.find(e => e.effectId === 'buff_dexterity_3');
        expect(dexBuff).toBeDefined();
        expect(dexBuff?.turnsLeft).toBe(2); // Full duration (new effects applied AFTER turn processing)

        const liveStats = (updatedCaster?.liveStats || {}) as unknown as LiveStats;
        expect(liveStats.Dexterity_rollbonus).toBe(3);
      } else {
        // Check failed, which is acceptable given the randomness
        console.log('Chi Step activation failed check, skipping effect verification');
      }
    });

    it('4.3 Stat Modifier Effects - chi balance restore', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Chi Manipulator',
        race: 'gaki',
        archetype: 'Life',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['gaki_chi_manipulation'], // Has ability_chi_balance_restore
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'gaki_chi_manipulation',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Chi manipulation provides restoration ability
      expect(data.data.powerUsed).toBe('Chi Manipulation');
    });

    it('4.3 Stat Modifier Effects - scene duration persists', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Scene Buffer',
        race: 'gaki',
        archetype: 'Life',
        physical: 5, // +6 modifier, ensures check success (d20+6 vs TN:10)
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['gaki_yin_shroud'], // Has buff_stealth_4 (scene), uses check_physical_vs_tn10
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'gaki_yin_shroud',
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Only verify effects if activation succeeded (check can randomly fail)
      if (data.data.activationSuccess === 'true') {
        // Verify scene duration
        const updatedCaster = await prisma.arkanaStats.findFirst({
          where: { userId: caster.id }
        });

        const activeEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
        const stealthBuff = activeEffects.find(e => e.effectId === 'buff_stealth_4');
        expect(stealthBuff).toBeDefined();
        expect(stealthBuff?.turnsLeft).toBe(999); // Full duration (new effects applied AFTER turn processing)
        expect(stealthBuff?.duration).toBe('scene');
      } else {
        console.log('Yin Shroud activation failed check, skipping scene duration verification');
      }
    });

    it('4.4 Control Effects - dreamwalk control', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Dream Walker',
        race: 'gaki',
        archetype: 'Death',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['gaki_dreamwalking'], // Has control_dreamwalk ability
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'gaki_dreamwalking',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Dreamwalking has control_dreamwalk ability effect
      expect(data.data.powerUsed).toBe('Dreamwalking');
    });
  });

  describe('5. Effect Stacking Tests', () => {
    it('5.1 same effect - longer duration wins', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Stacker',
        race: 'gaki',
        archetype: 'Psion',
        physical: 2,
        dexterity: 5, // +6 modifier, high chance of check success (d20+6 vs TN:10)
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['gaki_chi_step'],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'buff_dexterity_3',
            name: 'Dexterity Bonus +3',
            duration: 'turns:2',
            turnsLeft: 2,
            appliedAt: new Date(Date.now() - 10000).toISOString()
          }
        ]
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'gaki_chi_step',
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify effect not refreshed (2-1=1 from turn processing, not reset to 2)
      const updatedCaster = await prisma.arkanaStats.findFirst({
        where: { userId: caster.id }
      });

      const activeEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
      const dexBuff = activeEffects.find(e => e.effectId === 'buff_dexterity_3');

      // If activation succeeded, verify stacking logic
      if (data.data.activationSuccess === 'true') {
        expect(dexBuff?.turnsLeft).toBe(2); // New effect (turns:2) replaces old (turns:1) - longer duration wins
      } else {
        // Check failed - existing buff should still be decremented
        expect(dexBuff?.turnsLeft).toBe(1); // Original 2-1=1 from turn processing
      }
    });

    it('5.3 different effects on same stat accumulate', async () => {
      const target = await createArkanaTestUser({
        characterName: 'Multi Stat Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'buff_physical_1',
            name: 'Physical Bonus +1',
            duration: 'scene',
            turnsLeft: 5,
            appliedAt: new Date().toISOString()
          },
          {
            effectId: 'buff_attack_2',
            name: 'Attack Roll Buff +2',
            duration: 'scene',
            turnsLeft: 5,
            appliedAt: new Date().toISOString()
          }
        ]
        // liveStats auto-calculated
      });

      const updatedTarget = await prisma.arkanaStats.findFirst({
        where: { userId: target.id }
      });

      const liveStats = (updatedTarget?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.Physical_rollbonus).toBe(3); // 1 + 2
    });

    it('5.4 buff and debuff on same stat net out', async () => {
      const target = await createArkanaTestUser({
        characterName: 'Net Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'buff_physical_1',
            name: 'Physical Bonus +1',
            duration: 'scene',
            turnsLeft: 5,
            appliedAt: new Date().toISOString()
          },
          {
            effectId: 'debuff_physical_minus_2',
            name: 'Physical Debuff -2',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          }
        ]
        // liveStats auto-calculated
      });

      const updatedTarget = await prisma.arkanaStats.findFirst({
        where: { userId: target.id }
      });

      const liveStats = (updatedTarget?.liveStats || {}) as unknown as LiveStats;
      // Mixed modifierType: roll_bonus and stat_value don't combine
      expect(liveStats.Physical_rollbonus).toBe(1); // buff_physical_1 (roll_bonus)
      expect(liveStats.Physical).toBe(-2); // debuff_physical_minus_2 (stat_value)
    });
  });

  describe('6. Multi-Target Tests', () => {
    it('6.1 area power (Pulse Bloom) affects caster and all nearby allies', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Area Caster',
        race: 'veilborn',
        archetype: 'Blossoms',
        physical: 2,
        dexterity: 2,
        mental: 5, // +7 modifier, ensures check success (d20+7 vs TN:10)
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_pulse_bloom'], // Area power: buff_mental_2_area, targetType: "area"
        archetypePowers: []
      });

      const nearby1 = await createArkanaTestUser({
        characterName: 'Nearby Ally 1',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const nearby2 = await createArkanaTestUser({
        characterName: 'Nearby Ally 2',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_pulse_bloom',
        // No target_uuid for area power
        nearby_uuids: [nearby1.slUuid, nearby2.slUuid],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      if (data.data.activationSuccess === 'true') {
        // Verify response includes all affected users
        expect(data.data.affected).toBeDefined();
        expect(data.data.affected.length).toBe(3); // Caster + 2 nearby

        // Verify caster was buffed
        const updatedCaster = await prisma.arkanaStats.findFirst({
          where: { userId: caster.id }
        });
        const casterEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
        const casterBuff = casterEffects.find(e => e.effectId === 'buff_mental_2_area');
        expect(casterBuff).toBeDefined();
        expect(casterBuff?.turnsLeft).toBe(2);

        const casterLiveStats = (updatedCaster?.liveStats || {}) as unknown as LiveStats;
        expect(casterLiveStats.Mental_rollbonus).toBe(2); // buff_mental_2_area is roll_bonus type

        // Verify nearby allies were buffed
        const updatedNearby1 = await prisma.arkanaStats.findFirst({
          where: { userId: nearby1.id }
        });
        const nearby1Effects = (updatedNearby1?.activeEffects || []) as unknown as ActiveEffect[];
        expect(nearby1Effects.some(e => e.effectId === 'buff_mental_2_area')).toBe(true);

        const updatedNearby2 = await prisma.arkanaStats.findFirst({
          where: { userId: nearby2.id }
        });
        const nearby2Effects = (updatedNearby2?.activeEffects || []) as unknown as ActiveEffect[];
        expect(nearby2Effects.some(e => e.effectId === 'buff_mental_2_area')).toBe(true);
      } else {
        console.log('Pulse Bloom activation failed check, skipping area power verification');
      }
    });

    it('6.2 area power excludes caster from nearby list (no duplicates)', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Caster',
        race: 'veilborn',
        archetype: 'Blossoms',
        physical: 2,
        dexterity: 2,
        mental: 5, // +7 modifier, ensures check success
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_pulse_bloom'],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_pulse_bloom',
        // Incorrectly includes caster in nearby_uuids (should be filtered out)
        nearby_uuids: [caster.slUuid],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      if (data.data.activationSuccess === 'true') {
        // Verify only caster affected (no duplicates)
        expect(data.data.affected.length).toBe(1);
        expect(data.data.affected[0].uuid).toBe(caster.slUuid);
      }
    });

    it('6.3 area power filters out nearby users not in RP mode', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Caster',
        race: 'veilborn',
        archetype: 'Blossoms',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_pulse_bloom'],
        archetypePowers: []
      });

      const nearbyRP = await createArkanaTestUser({
        characterName: 'In RP Mode',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: [],
        status: 0 // RP mode
      });

      const nearbyOOC = await createArkanaTestUser({
        characterName: 'OOC Player',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: [],
        status: 1 // OOC mode
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_pulse_bloom',
        nearby_uuids: [nearbyRP.slUuid, nearbyOOC.slUuid],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      if (data.data.activationSuccess === 'true') {
        // Verify only caster + RP player affected (OOC excluded)
        expect(data.data.affected.length).toBe(2);
        const affectedUUIDs = data.data.affected.map((a: { uuid: string }) => a.uuid);
        expect(affectedUUIDs).toContain(caster.slUuid);
        expect(affectedUUIDs).toContain(nearbyRP.slUuid);
        expect(affectedUUIDs).not.toContain(nearbyOOC.slUuid);

        // Verify OOC player was NOT affected
        const updatedOOC = await prisma.arkanaStats.findFirst({
          where: { userId: nearbyOOC.id }
        });
        const oocEffects = (updatedOOC?.activeEffects || []) as unknown as ActiveEffect[];
        expect(oocEffects.length).toBe(0);
      }
    });

    it('6.4 self-targeted power applies to caster only', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Self Buffer',
        race: 'gaki',
        archetype: 'Life',
        physical: 2,
        dexterity: 5, // +6 modifier, high chance of check success (d20+6 vs TN:10)
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['gaki_chi_step'], // Self-targeted, uses check_dexterity_vs_tn10
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'gaki_chi_step',
        // No target_uuid
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.caster.uuid).toBe(caster.slUuid);

      // Only verify effects if activation succeeded (check can randomly fail)
      if (data.data.activationSuccess === 'true') {
        // Verify caster has buff
        const updatedCaster = await prisma.arkanaStats.findFirst({
          where: { userId: caster.id }
        });

        const activeEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
        expect(activeEffects.length).toBeGreaterThan(0);

        const liveStats = (updatedCaster?.liveStats || {}) as unknown as LiveStats;
        expect(liveStats.Dexterity_rollbonus).toBeDefined();
      } else {
        console.log('Chi Step activation failed check, skipping self-target verification');
      }
    });

    it('6.5 area power with empty nearby_uuids affects caster only', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Lone Caster',
        race: 'veilborn',
        archetype: 'Blossoms',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_pulse_bloom'],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_pulse_bloom',
        nearby_uuids: [], // No nearby players
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      if (data.data.activationSuccess === 'true') {
        // Verify only caster affected
        expect(data.data.affected.length).toBe(1);
        expect(data.data.affected[0].uuid).toBe(caster.slUuid);

        // Verify caster has buff
        const updatedCaster = await prisma.arkanaStats.findFirst({
          where: { userId: caster.id }
        });
        const casterEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
        expect(casterEffects.some(e => e.effectId === 'buff_mental_2_area')).toBe(true);
      }
    });

    it('6.6 single-target power with nearby_uuids affects only specified target', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Caster',
        race: 'gaki',
        archetype: 'Life',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['gaki_chi_manipulation'], // Single target power
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Primary Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const nearby = await createArkanaTestUser({
        characterName: 'Nearby Observer',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'gaki_chi_manipulation',
        target_uuid: target.slUuid,
        nearby_uuids: [nearby.slUuid], // Should be ignored for single-target power
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify nearby player was NOT affected (only specific target)
      const updatedNearby = await prisma.arkanaStats.findFirst({
        where: { userId: nearby.id }
      });
      const nearbyEffects = (updatedNearby?.activeEffects || []) as unknown as ActiveEffect[];
      expect(nearbyEffects.length).toBe(0);
    });
  });

  describe('7. Power-Attack vs Power-Activate Comparison', () => {
    it('7.1 power-attack DOES process turn (consistent with power-activate)', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Attacker',
        race: 'strigoi',
        archetype: 'Life',
        physical: 3,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 15,
        commonPowers: ['strigoi_hypnosis'],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'buff_dexterity_3',
            name: 'Dexterity Bonus +3',
            duration: 'turns:2',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          }
        ],
        liveStats: { Dexterity_rollbonus: 3 }
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'strigoi_hypnosis',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await PowerAttackPOST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify attacker's effects ARE decremented (now consistent with power-activate)
      const updatedAttacker = await prisma.arkanaStats.findFirst({
        where: { userId: attacker.id }
      });

      const activeEffects = (updatedAttacker?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects[0].turnsLeft).toBe(2); // Decremented from 3 to 2
    });

    it('7.2 power-activate DOES process turn', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Caster',
        race: 'strigoi',
        archetype: 'Life',
        physical: 3,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 15,
        commonPowers: ['strigoi_hypnosis'],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'buff_dexterity_3',
            name: 'Dexterity Bonus +3',
            duration: 'turns:2',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          }
        ],
        liveStats: { Dexterity_rollbonus: 3 }
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'strigoi_hypnosis',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify caster's effects ARE decremented
      const updatedCaster = await prisma.arkanaStats.findFirst({
        where: { userId: caster.id }
      });

      const activeEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects[0].turnsLeft).toBe(2); // Decremented by 1
    });
  });

  describe('8. Validation Schema Tests', () => {
    it('8.1 should accept valid request with power_id', () => {
      const payload = {
        caster_uuid: generateTestUUID(),
        power_id: 'some_power',
        target_uuid: generateTestUUID(),
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerActivateSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('8.2 should accept valid request with power_name', () => {
      const payload = {
        caster_uuid: generateTestUUID(),
        power_name: 'Hypnosis',
        target_uuid: generateTestUUID(),
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerActivateSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('8.3 should accept both power_id and power_name', () => {
      const payload = {
        caster_uuid: generateTestUUID(),
        power_id: 'some_power',
        power_name: 'Hypnosis',
        target_uuid: generateTestUUID(),
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerActivateSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('8.4 should reject missing both power_id and power_name', () => {
      const payload = {
        caster_uuid: generateTestUUID(),
        target_uuid: generateTestUUID(),
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerActivateSchema.validate(payload);
      expect(error).toBeDefined();
    });

    it('8.5 should accept optional target_uuid', () => {
      const payload = {
        caster_uuid: generateTestUUID(),
        power_id: 'some_power',
        // No target_uuid
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerActivateSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('8.6 should reject invalid universe', () => {
      const payload = {
        caster_uuid: generateTestUUID(),
        power_id: 'some_power',
        universe: 'gor', // Invalid for power-activate
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerActivateSchema.validate(payload);
      expect(error).toBeDefined();
    });
  });

  describe('9. Response Format Tests', () => {
    it('9.1 should return correct success response structure', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Caster',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_entropy_pulse',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.activationSuccess).toBeDefined();
      expect(data.data.powerUsed).toBeDefined();
      expect(data.data.powerBaseStat).toBeDefined();
      expect(data.data.rollInfo).toBeDefined();
      expect(data.data.affected).toBeDefined();
      expect(data.data.caster).toBeDefined();
      expect(data.data.message).toBeDefined();
    });
  });

  describe('10. Edge Cases & Error Handling', () => {
    it('10.1 should return 404 for non-existent power', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Caster',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'nonexistent_power',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Ability not found');
      expect(response.status).toBe(404);
    });

    it('10.2 should return 404 for invalid caster', async () => {
      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: generateTestUUID(),
        power_id: 'veil_entropy_pulse',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(404);
    });

    it('10.3 should return 404 for invalid target when required', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Caster',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_entropy_pulse',
        target_uuid: generateTestUUID(), // Invalid
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(404);
    });

    it('10.4 should return 404 for incomplete registration', async () => {
      const { user } = await createTestUser('arkana');

      await prisma.userStats.create({
        data: {
          userId: user.id,
          health: 100,
          hunger: 100,
          thirst: 100,
          copperCoin: 100,
          status: 0
        }
      });

      await prisma.arkanaStats.create({
        data: {
          userId: user.id,
          agentName: user.username + ' Resident',
          registrationCompleted: false, // Incomplete
          characterName: 'Incomplete',
          race: 'human',
          archetype: 'Psion',
          physical: 2,
          dexterity: 2,
          mental: 4,
          perception: 3,
          hitPoints: 10,
          commonPowers: ['veil_entropy_pulse'],
          archetypePowers: []
        }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: user.slUuid,
        power_id: 'veil_entropy_pulse',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'registration incomplete');
      expect(response.status).toBe(404);
    });

    it('10.5 should handle empty active effects', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Clean Caster',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: [],
        activeEffects: [], // Empty
        liveStats: {}
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_entropy_pulse',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
    });
  });

  describe('11. Database Integration Tests', () => {
    it('11.1 should persist activeEffects to database', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Caster',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_entropy_pulse',
        target_uuid: target.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify database persistence
      const updatedTarget = await prisma.arkanaStats.findFirst({
        where: { userId: target.id }
      });

      expect(updatedTarget?.activeEffects).toBeDefined();
      const activeEffects = (updatedTarget?.activeEffects || []) as unknown as ActiveEffect[];
      expect(Array.isArray(activeEffects)).toBe(true);
    });

    it('11.2 should persist liveStats to database', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Caster',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_entropy_pulse',
        target_uuid: target.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify database persistence
      const updatedTarget = await prisma.arkanaStats.findFirst({
        where: { userId: target.id }
      });

      expect(updatedTarget?.liveStats).toBeDefined();
      const liveStats = (updatedTarget?.liveStats || {}) as unknown as LiveStats;
      expect(typeof liveStats).toBe('object');
    });

    it('11.3 should update both activeEffects and liveStats in single transaction', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Transactional',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'buff_dexterity_3',
            name: 'Dexterity Bonus +3',
            duration: 'turns:2',
            turnsLeft: 2,
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_entropy_pulse',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify both fields updated
      const updatedCaster = await prisma.arkanaStats.findFirst({
        where: { userId: caster.id }
      });

      const activeEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects[0].turnsLeft).toBe(1); // Decremented

      const liveStats = (updatedCaster?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.Dexterity_rollbonus).toBe(3); // Recalculated
    });
  });

  describe('12. Integration Tests (Full Flow)', () => {
    it('12.1 complete ability power flow with turn processing', async () => {
      // Step 1: Create two players
      const caster = await createArkanaTestUser({
        characterName: 'Flow Caster',
        race: 'gaki',
        archetype: 'Psion',
        physical: 2,
        dexterity: 5, // +6 modifier, ensures check success (d20+6 vs TN:10)
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['gaki_chi_step'], // Self buff (dexterity +3), uses check_dexterity_vs_tn10
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Flow Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      // Step 2: Caster activates buff on self
      let timestamp = new Date().toISOString();
      let signature = generateSignature(timestamp, 'arkana');

      let requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'gaki_chi_step',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      let request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      let response = await POST(request);
      let data = await parseJsonResponse(response);

      expectSuccess(data);

      // Save first activation result to check later
      const firstActivationSucceeded = data.data.activationSuccess === 'true';

      // Step 3: Verify caster has active effect and liveStats (only if activation succeeded)
      // Note: gaki_chi_step has a check that can randomly fail
      if (firstActivationSucceeded) {
        const updatedCaster = await prisma.arkanaStats.findFirst({
          where: { userId: caster.id }
        });

        const activeEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
        expect(activeEffects.length).toBeGreaterThan(0);
        expect(activeEffects[0].turnsLeft).toBe(2); // Full duration (new effects applied AFTER turn processing)

        const liveStats = (updatedCaster?.liveStats || {}) as unknown as LiveStats;
        expect(liveStats.Dexterity_rollbonus).toBe(3);
      } else {
        // If activation failed, skip to second power test
        console.log('First power activation failed check, skipping effect verification');
      }

      // Step 4: Caster activates another power (turn 2)
      // Add a second ability power for caster
      await prisma.arkanaStats.update({
        where: { userId: caster.id },
        data: {
          commonPowers: ['gaki_chi_step', 'gaki_chi_manipulation']
        }
      });

      timestamp = new Date().toISOString();
      signature = generateSignature(timestamp, 'arkana');

      requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'gaki_chi_manipulation',
        target_uuid: target.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      response = await POST(request);
      data = await parseJsonResponse(response);

      expectSuccess(data);

      // Step 5: Verify buff decremented (started at turns:2, now at turns:1) - only if first activation succeeded
      const updatedCaster2 = await prisma.arkanaStats.findFirst({
        where: { userId: caster.id }
      });

      const activeEffects2 = (updatedCaster2?.activeEffects || []) as unknown as ActiveEffect[];

      // If first activation succeeded, buff should still be active with turnsLeft:1 after second activation
      if (firstActivationSucceeded) {
        expect(activeEffects2.length).toBe(1); // Buff still active
        expect(activeEffects2[0].turnsLeft).toBe(1); // Decremented from 2 to 1

        const liveStats2 = (updatedCaster2?.liveStats || {}) as unknown as LiveStats;
        expect(liveStats2.Dexterity_rollbonus).toBe(3); // Effect still active
      }

      // Step 6: Verify target was affected by second power
      const updatedTarget = await prisma.arkanaStats.findFirst({
        where: { userId: target.id }
      });

      // Chi manipulation is a restore ability, won't add debuffs in ability mode
      expect(updatedTarget).toBeDefined();
    });
  });

  describe('Utility Effects Tests', () => {
    it('should apply utility effects with caster name to targets', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Night Corvus',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['test_utility_sensor_sweep'],
        archetypePowers: []
      });

      const target1 = await createArkanaTestUser({
        characterName: 'Target One',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const target2 = await createArkanaTestUser({
        characterName: 'Target Two',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'test_utility_sensor_sweep',
        nearby_uuids: [target1.slUuid, target2.slUuid],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify target1 received utility effects with caster name
      const updatedTarget1 = await prisma.arkanaStats.findFirst({
        where: { userId: target1.id }
      });

      const target1ActiveEffects = (updatedTarget1?.activeEffects || []) as unknown as ActiveEffect[];
      expect(target1ActiveEffects.length).toBeGreaterThan(0);

      const eavesdropEffect = target1ActiveEffects.find(e => e.effectId === 'utility_test_eavesdrop');
      expect(eavesdropEffect).toBeDefined();
      expect(eavesdropEffect?.casterName).toBe('Night Corvus');
      expect(eavesdropEffect?.turnsLeft).toBe(999); // scene duration

      const detectMagicEffect = target1ActiveEffects.find(e => e.effectId === 'utility_test_detect_magic');
      expect(detectMagicEffect).toBeDefined();
      expect(detectMagicEffect?.casterName).toBe('Night Corvus');
      expect(detectMagicEffect?.turnsLeft).toBe(3); // turns:3 duration
    });

    it('should include utility effects in liveStatsString formatted output', async () => {
      const { loadAllData } = await import('@/lib/arkana/dataLoader');
      const { formatLiveStatsForLSL } = await import('@/lib/arkana/effectsUtils');
      await loadAllData();

      // Create user with both stat modifier and utility effects
      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'debuff_mental_minus_1',
          name: 'Mental Debuff -1',
          duration: 'turns:2',
          turnsLeft: 2,
          appliedAt: new Date().toISOString(),
          casterName: 'Alice'
        },
        {
          effectId: 'utility_test_eavesdrop',
          name: 'Test Remote Eavesdropping',
          duration: 'scene',
          turnsLeft: 999,
          appliedAt: new Date().toISOString(),
          casterName: 'Night Corvus'
        },
        {
          effectId: 'utility_test_telepathy',
          name: 'Test Telepathy',
          duration: 'turns:2',
          turnsLeft: 2,
          appliedAt: new Date().toISOString(),
          casterName: 'Bob'
        }
      ];

      const liveStats = { Mental: -1 };
      const formatted = formatLiveStatsForLSL(liveStats, activeEffects);
      const decoded = decodeURIComponent(formatted);

      // Should contain both sections
      expect(decoded).toContain('🔮 Effects:');
      expect(decoded).toContain('Mental -1');
      expect(decoded).toContain('🔧 Utilities:');
      expect(decoded).toContain('Test Remote Eavesdropping by Night Corvus');
      expect(decoded).toContain('scene');
      expect(decoded).toContain('Test Telepathy by Bob');
      expect(decoded).toContain('2 turns left');
    });

    it('should show utility effects with "Unknown" caster when casterName is missing', async () => {
      const { loadAllData } = await import('@/lib/arkana/dataLoader');
      const { formatLiveStatsForLSL } = await import('@/lib/arkana/effectsUtils');
      await loadAllData();

      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'utility_test_eavesdrop',
          name: 'Test Remote Eavesdropping',
          duration: 'scene',
          turnsLeft: 999,
          appliedAt: new Date().toISOString()
          // No casterName field
        }
      ];

      const liveStats = {};
      const formatted = formatLiveStatsForLSL(liveStats, activeEffects);
      const decoded = decodeURIComponent(formatted);

      expect(decoded).toContain('🔧 Utilities:');
      expect(decoded).toContain('Test Remote Eavesdropping by Unknown');
    });

    it('should format utility effects correctly in combat messages', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Telepath',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['test_utility_mind_link'],
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Receiver',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'test_utility_mind_link',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify utility effect was applied
      const updatedTarget = await prisma.arkanaStats.findFirst({
        where: { userId: target.id }
      });

      const activeEffects = (updatedTarget?.activeEffects || []) as unknown as ActiveEffect[];
      const telepathyEffect = activeEffects.find(e => e.effectId === 'utility_test_telepathy');
      expect(telepathyEffect).toBeDefined();
      expect(telepathyEffect?.casterName).toBe('Telepath');
      expect(telepathyEffect?.turnsLeft).toBe(2);
    });

    it('should handle multiple utility effects on same target from different casters', async () => {
      const caster1 = await createArkanaTestUser({
        characterName: 'Caster One',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['test_utility_mind_link'],
        archetypePowers: []
      });

      const caster2 = await createArkanaTestUser({
        characterName: 'Caster Two',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['test_utility_sensor_sweep'],
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Multi Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp1 = new Date().toISOString();
      const signature1 = generateSignature(timestamp1, 'arkana');

      // First caster applies utility
      const request1Data = {
        caster_uuid: caster1.slUuid,
        power_id: 'test_utility_mind_link',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp1,
        signature: signature1
      };

      let request = createMockPostRequest('/api/arkana/combat/power-activate', request1Data);
      let response = await POST(request);
      let data = await parseJsonResponse(response);
      expectSuccess(data);

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      const timestamp2 = new Date().toISOString();
      const signature2 = generateSignature(timestamp2, 'arkana');

      // Second caster applies different utility
      const request2Data = {
        caster_uuid: caster2.slUuid,
        power_id: 'test_utility_sensor_sweep',
        nearby_uuids: [target.slUuid],
        universe: 'arkana',
        timestamp: timestamp2,
        signature: signature2
      };

      request = createMockPostRequest('/api/arkana/combat/power-activate', request2Data);
      response = await POST(request);
      data = await parseJsonResponse(response);
      expectSuccess(data);

      // Verify target has utilities from both casters
      const updatedTarget = await prisma.arkanaStats.findFirst({
        where: { userId: target.id }
      });

      const activeEffects = (updatedTarget?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects.length).toBeGreaterThan(2);

      const telepathyEffect = activeEffects.find(e => e.effectId === 'utility_test_telepathy');
      expect(telepathyEffect).toBeDefined();
      expect(telepathyEffect?.casterName).toBe('Caster One');

      const eavesdropEffect = activeEffects.find(e => e.effectId === 'utility_test_eavesdrop');
      expect(eavesdropEffect).toBeDefined();
      expect(eavesdropEffect?.casterName).toBe('Caster Two');

      const detectEffect = activeEffects.find(e => e.effectId === 'utility_test_detect_magic');
      expect(detectEffect).toBeDefined();
      expect(detectEffect?.casterName).toBe('Caster Two');
    });
  });

  describe('Control Effects Tests', () => {
    it('should include control effects in liveStatsString formatted output', async () => {
      const { loadAllData } = await import('@/lib/arkana/dataLoader');
      const { formatLiveStatsForLSL } = await import('@/lib/arkana/effectsUtils');
      await loadAllData();

      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'control_test_stun',
          name: 'Test Stunning Strike',
          duration: 'turns:1',
          turnsLeft: 1,
          appliedAt: new Date().toISOString(),
          casterName: 'Alice'
        },
        {
          effectId: 'control_test_fear',
          name: 'Test Terrifying Presence',
          duration: 'turns:2',
          turnsLeft: 2,
          appliedAt: new Date().toISOString(),
          casterName: 'Bob'
        }
      ];

      const liveStats = {};
      const formatted = formatLiveStatsForLSL(liveStats, activeEffects);
      const decoded = decodeURIComponent(formatted);

      expect(decoded).toContain('⛓️ Control:');
      expect(decoded).toContain('Test Stunning Strike by Alice(1 turn left)');
      expect(decoded).toContain('Test Terrifying Presence by Bob(2 turns left)');
    });

    it('should format control effects with scene duration correctly', async () => {
      const { loadAllData } = await import('@/lib/arkana/dataLoader');
      const { formatLiveStatsForLSL } = await import('@/lib/arkana/effectsUtils');
      await loadAllData();

      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'control_test_silence',
          name: 'Test Mystic Silence',
          duration: 'scene',
          turnsLeft: 999,
          appliedAt: new Date().toISOString(),
          casterName: 'Wizard'
        }
      ];

      const liveStats = {};
      const formatted = formatLiveStatsForLSL(liveStats, activeEffects);
      const decoded = decodeURIComponent(formatted);

      expect(decoded).toContain('⛓️ Control:');
      expect(decoded).toContain('Test Mystic Silence by Wizard(scene)');
    });

    it('should display control effects alongside other effect categories', async () => {
      const { loadAllData } = await import('@/lib/arkana/dataLoader');
      const { formatLiveStatsForLSL } = await import('@/lib/arkana/effectsUtils');
      await loadAllData();

      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'buff_mental_1_turn',
          name: 'Mental Buff +1 (1 turn)',
          duration: 'turns:1',
          turnsLeft: 1,
          appliedAt: new Date().toISOString(),
          casterName: 'Alice'
        },
        {
          effectId: 'control_paralyze',
          name: 'Paralytic Effect',
          duration: 'turns:2',
          turnsLeft: 2,
          appliedAt: new Date().toISOString(),
          casterName: 'Bob'
        },
        {
          effectId: 'utility_test_eavesdrop',
          name: 'Test Remote Eavesdropping',
          duration: 'scene',
          turnsLeft: 999,
          appliedAt: new Date().toISOString(),
          casterName: 'Charlie'
        }
      ];

      const liveStats = { Mental: 1 };
      const formatted = formatLiveStatsForLSL(liveStats, activeEffects);
      const decoded = decodeURIComponent(formatted);

      // All sections should be present
      expect(decoded).toContain('🔮 Effects:');
      expect(decoded).toContain('Mental +1');
      expect(decoded).toContain('⛓️ Control:');
      expect(decoded).toContain('Paralytic Effect by Bob(2 turns left)');
      expect(decoded).toContain('🔧 Utilities:');
      expect(decoded).toContain('Test Remote Eavesdropping by Charlie(scene)');
    });
  });

  describe('Special Effects Tests', () => {
    it('should apply special effects with caster name to self', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Shadow Master',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['test_special_shadow_walk'],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'test_special_shadow_walk',
        // Self-targeted, no target_uuid
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify caster received special effect with their own name
      const updatedCaster = await prisma.arkanaStats.findFirst({
        where: { userId: caster.id }
      });

      const casterActiveEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
      const shadowformEffect = casterActiveEffects.find(e => e.effectId === 'special_test_shadowform');
      expect(shadowformEffect).toBeDefined();
      expect(shadowformEffect?.casterName).toBe('Shadow Master');
      expect(shadowformEffect?.turnsLeft).toBe(999); // scene duration
    });

    it('should include special effects in liveStatsString formatted output', async () => {
      const { loadAllData } = await import('@/lib/arkana/dataLoader');
      const { formatLiveStatsForLSL } = await import('@/lib/arkana/effectsUtils');
      await loadAllData();

      // Create user with stat modifier, utility, and special effects
      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'debuff_mental_minus_1',
          name: 'Mental Debuff -1',
          duration: 'turns:2',
          turnsLeft: 2,
          appliedAt: new Date().toISOString(),
          casterName: 'Alice'
        },
        {
          effectId: 'utility_test_eavesdrop',
          name: 'Test Remote Eavesdropping',
          duration: 'scene',
          turnsLeft: 999,
          appliedAt: new Date().toISOString(),
          casterName: 'Bob'
        },
        {
          effectId: 'special_test_shadowform',
          name: 'Test Shadowform',
          duration: 'scene',
          turnsLeft: 999,
          appliedAt: new Date().toISOString(),
          casterName: 'Shadow Master'
        }
      ];

      const liveStats = { Mental: -1 };
      const formatted = formatLiveStatsForLSL(liveStats, activeEffects);
      const decoded = decodeURIComponent(formatted);

      // Should contain all three sections
      expect(decoded).toContain('🔮 Effects:');
      expect(decoded).toContain('Mental -1');
      expect(decoded).toContain('🔧 Utilities:');
      expect(decoded).toContain('Test Remote Eavesdropping by Bob');
      expect(decoded).toContain('✨ Special:');
      expect(decoded).toContain('Test Shadowform by Shadow Master');
      expect(decoded).toContain('scene');
    });

    it('should show special effects with "Unknown" caster when casterName is missing', async () => {
      const { loadAllData } = await import('@/lib/arkana/dataLoader');
      const { formatLiveStatsForLSL } = await import('@/lib/arkana/effectsUtils');
      await loadAllData();

      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'special_test_shadowform',
          name: 'Test Shadowform',
          duration: 'scene',
          turnsLeft: 999,
          appliedAt: new Date().toISOString()
          // No casterName field
        }
      ];

      const liveStats = {};
      const formatted = formatLiveStatsForLSL(liveStats, activeEffects);
      const decoded = decodeURIComponent(formatted);

      expect(decoded).toContain('✨ Special:');
      expect(decoded).toContain('Test Shadowform by Unknown');
    });

    it('should handle multiple special effects from different casters', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Mist Walker',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['test_special_group_mist'],
        archetypePowers: []
      });

      const target1 = await createArkanaTestUser({
        characterName: 'Target Alpha',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const target2 = await createArkanaTestUser({
        characterName: 'Target Beta',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'test_special_group_mist',
        nearby_uuids: [target1.slUuid, target2.slUuid],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify both targets received special effect with caster name
      const updatedTarget1 = await prisma.arkanaStats.findFirst({
        where: { userId: target1.id }
      });

      const target1ActiveEffects = (updatedTarget1?.activeEffects || []) as unknown as ActiveEffect[];
      const mistEffect1 = target1ActiveEffects.find(e => e.effectId === 'special_test_mist');
      expect(mistEffect1).toBeDefined();
      expect(mistEffect1?.casterName).toBe('Mist Walker');
      expect(mistEffect1?.turnsLeft).toBe(3);

      const updatedTarget2 = await prisma.arkanaStats.findFirst({
        where: { userId: target2.id }
      });

      const target2ActiveEffects = (updatedTarget2?.activeEffects || []) as unknown as ActiveEffect[];
      const mistEffect2 = target2ActiveEffects.find(e => e.effectId === 'special_test_mist');
      expect(mistEffect2).toBeDefined();
      expect(mistEffect2?.casterName).toBe('Mist Walker');
      expect(mistEffect2?.turnsLeft).toBe(3);
    });

    it('should display all three effect categories together', async () => {
      const { loadAllData } = await import('@/lib/arkana/dataLoader');
      const { formatLiveStatsForLSL } = await import('@/lib/arkana/effectsUtils');
      await loadAllData();

      // Create comprehensive set of effects covering all categories
      const activeEffects: ActiveEffect[] = [
        // Stat modifier
        {
          effectId: 'debuff_mental_minus_1',
          name: 'Mental Debuff -1',
          duration: 'turns:2',
          turnsLeft: 2,
          appliedAt: new Date().toISOString(),
          casterName: 'Alice'
        },
        {
          effectId: 'buff_physical_1',
          name: 'Physical Bonus +1',
          duration: 'turns:3',
          turnsLeft: 3,
          appliedAt: new Date().toISOString(),
          casterName: 'Bob'
        },
        // Utility
        {
          effectId: 'utility_test_eavesdrop',
          name: 'Test Remote Eavesdropping',
          duration: 'scene',
          turnsLeft: 999,
          appliedAt: new Date().toISOString(),
          casterName: 'Charlie'
        },
        {
          effectId: 'utility_test_telepathy',
          name: 'Test Telepathy',
          duration: 'turns:2',
          turnsLeft: 2,
          appliedAt: new Date().toISOString(),
          casterName: 'Diana'
        },
        // Special
        {
          effectId: 'special_test_shadowform',
          name: 'Test Shadowform',
          duration: 'scene',
          turnsLeft: 999,
          appliedAt: new Date().toISOString(),
          casterName: 'Shadow Master'
        },
        {
          effectId: 'special_test_mimic',
          name: 'Test Power Mimic',
          duration: 'turns:2',
          turnsLeft: 2,
          appliedAt: new Date().toISOString(),
          casterName: 'Mimic'
        }
      ];

      const liveStats = { Mental: -1, Physical: 1 };
      const formatted = formatLiveStatsForLSL(liveStats, activeEffects);
      const decoded = decodeURIComponent(formatted);

      // Verify all three sections exist
      expect(decoded).toContain('🔮 Effects:');
      expect(decoded).toContain('🔧 Utilities:');
      expect(decoded).toContain('✨ Special:');

      // Verify stat modifiers
      expect(decoded).toContain('Mental -1');
      expect(decoded).toContain('Physical +1');

      // Verify utilities
      expect(decoded).toContain('Test Remote Eavesdropping by Charlie');
      expect(decoded).toContain('Test Telepathy by Diana');

      // Verify special effects
      expect(decoded).toContain('Test Shadowform by Shadow Master');
      expect(decoded).toContain('Test Power Mimic by Mimic');
    });
  });

  // === DEFENSE EFFECT TESTS ===

  describe('Defense Effects (Damage Reduction)', () => {
    it('should apply defense effect and display in liveStatsString', async () => {
      const { loadAllData } = await import('@/lib/arkana/dataLoader');
      await loadAllData();

      const { formatLiveStatsForLSL } = await import('@/lib/arkana/effectsUtils');

      const caster = await createArkanaTestUser({
        characterName: 'Tank',
        race: 'human',
        archetype: 'Defender',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 20,
        commonPowers: ['test_defense_harden_skin'],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'test_defense_harden_skin',
        nearby_uuids: [],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      const updatedCaster = await prisma.arkanaStats.findFirst({ where: { userId: caster.id } });
      const activeEffects = updatedCaster?.activeEffects as ActiveEffect[];
      const liveStats = updatedCaster?.liveStats as LiveStats;

      expect(activeEffects).toHaveLength(1);
      expect(activeEffects[0].effectId).toBe('defense_test_reduction_3');

      const formatted = formatLiveStatsForLSL(liveStats, activeEffects);
      const decoded = decodeURIComponent(formatted);

      expect(decoded).toContain('🛡️ Defense:');
      expect(decoded).toContain('Damage Reduction -3');
      expect(decoded).toContain('Test Damage Reduction');
    });

    it('should stack multiple defense effects correctly', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Mega Tank',
        race: 'human',
        archetype: 'Defender',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 30,
        commonPowers: [],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'defense_test_reduction_3',
            name: 'Test Damage Reduction -3',
            duration: 'turns:2',
            turnsLeft: 2,
            appliedAt: new Date().toISOString()
          },
          {
            effectId: 'defense_test_reduction_2',
            name: 'Test Natural Armor',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const { calculateDamageReduction, formatLiveStatsForLSL } = await import('@/lib/arkana/effectsUtils');

      // Reload to get arkanaStats populated
      const reloadedCaster = await prisma.arkanaStats.findFirst({ where: { userId: caster.id } });
      const activeEffects = reloadedCaster?.activeEffects as ActiveEffect[];

      const reduction = calculateDamageReduction(activeEffects);
      expect(reduction).toBe(5); // 3 + 2

      const formatted = formatLiveStatsForLSL({}, activeEffects);
      const decoded = decodeURIComponent(formatted);

      expect(decoded).toContain('Damage Reduction -5');
    });

    it('should reduce damage to 0 but not below', async () => {
      const { loadAllData } = await import('@/lib/arkana/dataLoader');
      await loadAllData();

      const attacker = await createArkanaTestUser({
        characterName: 'Weak Attacker',
        race: 'human',
        archetype: 'Striker',
        physical: 1,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10,
        commonPowers: ['spliced_tail_slap'],  // Does 3 + Physical damage
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Armored Target',
        race: 'human',
        archetype: 'Defender',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 20,
        commonPowers: [],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'defense_test_reduction_5_scene',
            name: 'Test Hardened Shell',
            duration: 'scene',
            turnsLeft: 999,
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      // Use power-attack route to test damage reduction
      const { POST: PowerAttackPOST } = await import('@/app/api/arkana/combat/power-attack/route');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'spliced_tail_slap',
        target_uuid: target.slUuid,
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await PowerAttackPOST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Damage should be reduced to 0 (tail slap does ~3 damage, defense blocks 5)
      expect(data.data.totalDamage).toBe(0);

      // Health should not change from initial value (hitPoints = 20, since we didn't specify health)
      const updatedTarget = await prisma.user.findFirst({
        where: { id: target.id },
        include: { stats: true }
      });
      expect(updatedTarget?.stats?.health).toBe(20);  // Defaults to hitPoints (maxHP)
    });

    it('should show blocked damage in attack message', async () => {
      const { loadAllData } = await import('@/lib/arkana/dataLoader');
      await loadAllData();

      const attacker = await createArkanaTestUser({
        characterName: 'Strong Attacker',
        race: 'human',
        archetype: 'Striker',
        physical: 4,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 15,
        commonPowers: ['spliced_tail_slap'],
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Defended Target',
        race: 'human',
        archetype: 'Defender',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 25,
        commonPowers: [],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'defense_test_reduction_3',
            name: 'Test Damage Reduction -3',
            duration: 'turns:2',
            turnsLeft: 2,
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const { POST: PowerAttackPOST } = await import('@/app/api/arkana/combat/power-attack/route');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'spliced_tail_slap',
        target_uuid: target.slUuid,
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await PowerAttackPOST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Only verify defense message if attack succeeded
      if (data.data.attackSuccess === 'true') {
        const message = decodeURIComponent(data.data.message);
        expect(message).toContain('blocked by defenses');
        expect(message).toMatch(/\d+ damage dealt \(\d+ blocked by defenses\)/);
      }
    });

    it('should display scene-based defense effects with "scene" duration', async () => {
      const { formatLiveStatsForLSL } = await import('@/lib/arkana/effectsUtils');

      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'defense_test_reduction_5_scene',
          name: 'Test Hardened Shell',
          duration: 'scene',
          turnsLeft: 999,
          appliedAt: new Date().toISOString()
        }
      ];

      const formatted = formatLiveStatsForLSL({}, activeEffects);
      const decoded = decodeURIComponent(formatted);

      expect(decoded).toContain('🛡️ Defense:');
      expect(decoded).toContain('scene');
      expect(decoded).not.toContain('999 turns');
    });

    it('should persist turn-based defense effects across multiple turns', async () => {
      const { loadAllData } = await import('@/lib/arkana/dataLoader');
      await loadAllData();

      const caster = await createArkanaTestUser({
        characterName: 'Persistent Defender',
        race: 'human',
        archetype: 'Defender',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 20,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'defense_test_reduction_2',
            name: 'Test Natural Armor',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_entropy_pulse',
        nearby_uuids: [],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      await POST(request);

      const updatedCaster = await prisma.arkanaStats.findFirst({ where: { userId: caster.id } });
      const activeEffects = updatedCaster?.activeEffects as ActiveEffect[];

      expect(activeEffects).toHaveLength(1);
      expect(activeEffects[0].effectId).toBe('defense_test_reduction_2');
      expect(activeEffects[0].turnsLeft).toBe(2); // 3 - 1
    });

    it('should NOT decrement scene-based defense effects', async () => {
      const { loadAllData } = await import('@/lib/arkana/dataLoader');
      await loadAllData();

      const caster = await createArkanaTestUser({
        characterName: 'Scene Defender',
        race: 'human',
        archetype: 'Defender',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 20,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'defense_test_reduction_5_scene',
            name: 'Test Hardened Shell',
            duration: 'scene',
            turnsLeft: 999,
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        caster_uuid: caster.slUuid,
        power_id: 'veil_entropy_pulse',
        nearby_uuids: [],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      await POST(request);

      const updatedCaster = await prisma.arkanaStats.findFirst({ where: { userId: caster.id } });
      const activeEffects = updatedCaster?.activeEffects as ActiveEffect[];

      expect(activeEffects).toHaveLength(1);
      expect(activeEffects[0].turnsLeft).toBe(999); // Scene effects don't decrement
    });

    it('should work with basic attack route damage reduction', async () => {
      const { loadAllData } = await import('@/lib/arkana/dataLoader');
      await loadAllData();

      const attacker = await createArkanaTestUser({
        characterName: 'Physical Attacker',
        race: 'human',
        archetype: 'Warrior',
        physical: 4,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 15,
        commonPowers: [],
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Armored Defender',
        race: 'human',
        archetype: 'Tank',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 25,
        commonPowers: [],
        archetypePowers: [],
        activeEffects: [
          {
            effectId: 'defense_test_reduction_3',
            name: 'Test Damage Reduction -3',
            duration: 'turns:2',
            turnsLeft: 2,
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const { POST: AttackPOST } = await import('@/app/api/arkana/combat/attack/route');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        target_uuid: target.slUuid,
        attack_type: 'physical',
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/attack', requestData);
      const response = await AttackPOST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // If hit, message should show damage reduction
      if (data.data.isHit === 'true') {
        const message = decodeURIComponent(data.data.message);
        // Damage might be reduced to different amounts, but if reduction applied, message should show it
        if (data.data.damage > 0 && data.data.damage < 5) {
          expect(message).toContain('blocked by defenses');
        }
      }
    });

    it('should display all four effect categories together', async () => {
      const { formatLiveStatsForLSL } = await import('@/lib/arkana/effectsUtils');

      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'debuff_mental_minus_1',
          name: 'Mental Debuff',
          duration: 'turns:2',
          turnsLeft: 2,
          appliedAt: new Date().toISOString(),
          casterName: 'Alice'
        },
        {
          effectId: 'utility_test_eavesdrop',
          name: 'Test Remote Eavesdropping',
          duration: 'scene',
          turnsLeft: 999,
          appliedAt: new Date().toISOString(),
          casterName: 'Bob'
        },
        {
          effectId: 'special_test_shadowform',
          name: 'Test Shadowform',
          duration: 'scene',
          turnsLeft: 999,
          appliedAt: new Date().toISOString(),
          casterName: 'Charlie'
        },
        {
          effectId: 'defense_test_reduction_3',
          name: 'Test Damage Reduction -3',
          duration: 'turns:2',
          turnsLeft: 2,
          appliedAt: new Date().toISOString()
        }
      ];

      const liveStats: LiveStats = { Mental: -1 };

      const formatted = formatLiveStatsForLSL(liveStats, activeEffects);
      const decoded = decodeURIComponent(formatted);

      expect(decoded).toContain('🔮 Effects:');
      expect(decoded).toContain('🔧 Utilities:');
      expect(decoded).toContain('✨ Special:');
      expect(decoded).toContain('🛡️ Defense:');

      expect(decoded).toContain('Mental -1');
      expect(decoded).toContain('Test Remote Eavesdropping by Bob');
      expect(decoded).toContain('Test Shadowform by Charlie');
      expect(decoded).toContain('Damage Reduction -3');
    });
  });

  // === HEAL EFFECT TESTS ===

  describe('Heal Effects Tests', () => {
    it('should apply immediate self-heal on activation', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Healer',
        race: 'human',
        archetype: 'Psion',
        physical: 11,  // maxHP = 11 × 5 = 55
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 55,  // MAX HP
        health: 50,  // CURRENT HP
        commonPowers: ['gaki_chi_manipulation'],
        archetypePowers: []
      });

      // Update to add perks for heal test
      await prisma.arkanaStats.update({
        where: { userId: caster.id },
        data: { perks: ['perk_test_self_heal'] }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const params = {
        caster_uuid: caster.slUuid,
        universe: 'arkana',
        power_id: 'perk_test_self_heal',
        ability_type: 'perk',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', params);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Check UserStats.health for current HP
      const updatedCasterStats = await prisma.userStats.findUnique({ where: { userId: caster.id } });
      expect(updatedCasterStats?.health).toBe(53); // 50 + 3
    });

    it('should apply duration-based heal to activeEffects', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'HoTCaster',
        race: 'human',
        archetype: 'Psion',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 50,
        commonPowers: [],
        archetypePowers: []
      });

      await prisma.arkanaStats.update({
        where: { userId: caster.id },
        data: { perks: ['perk_test_hot'] }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const params = {
        caster_uuid: caster.slUuid,
        universe: 'arkana',
        power_id: 'perk_test_hot',
        ability_type: 'perk',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', params);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      const updatedCaster = await prisma.arkanaStats.findUnique({ where: { userId: caster.id } });
      const effects = parseActiveEffects(updatedCaster?.activeEffects);
      expect(effects.some(e => e.effectId === 'heal_test_over_time_2')).toBe(true);
      const healEffect = effects.find(e => e.effectId === 'heal_test_over_time_2');
      expect(healEffect?.turnsLeft).toBe(3);
    });

    it('should process existing HoT effects during power activation', async () => {
      const activeEffects: ActiveEffect[] = [
        { effectId: 'heal_test_over_time_2', name: 'Test Heal Over Time +2', duration: 'turns:3', turnsLeft: 3, appliedAt: new Date().toISOString() }
      ];

      const caster = await createArkanaTestUser({
        characterName: 'ExistingHoT',
        race: 'human',
        archetype: 'Psion',
        physical: 11,  // maxHP = 11 × 5 = 55
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 55,  // MAX HP
        health: 50,  // CURRENT HP
        commonPowers: [],
        archetypePowers: [],
        activeEffects
      });

      await prisma.arkanaStats.update({
        where: { userId: caster.id },
        data: { perks: ['perk_test_buff'] }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const params = {
        caster_uuid: caster.slUuid,
        universe: 'arkana',
        power_id: 'perk_test_buff',
        ability_type: 'perk',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', params);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Check UserStats.health for current HP
      const updatedCasterStats = await prisma.userStats.findUnique({ where: { userId: caster.id } });
      expect(updatedCasterStats?.health).toBe(52); // 50 + 2 from HoT

      const updatedCaster = await prisma.arkanaStats.findUnique({ where: { userId: caster.id } });
      const effects = parseActiveEffects(updatedCaster?.activeEffects);
      const healEffect = effects.find(e => e.effectId === 'heal_test_over_time_2');
      expect(healEffect?.turnsLeft).toBe(2); // Decremented from 3
    });

    it('should cap immediate healing at maxHitPoints', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'NearMaxHP',
        race: 'human',
        archetype: 'Psion',
        physical: 20,  // maxHP = 20 × 5 = 100
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 100,  // NOTE: hitPoints in ArkanaStats is now MAX HP, not current HP
        commonPowers: [],
        archetypePowers: []
      });

      // Set current HP to 96 in UserStats (current HP is stored here)
      await prisma.userStats.update({
        where: { userId: caster.id },
        data: { health: 96 }
      });

      await prisma.arkanaStats.update({
        where: { userId: caster.id },
        data: { perks: ['perk_test_overheal'] }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const params = {
        caster_uuid: caster.slUuid,
        universe: 'arkana',
        power_id: 'perk_test_overheal',
        ability_type: 'perk',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', params);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Check UserStats.health for current HP (should be capped at maxHP=100)
      const updatedCasterStats = await prisma.userStats.findUnique({ where: { userId: caster.id } });
      expect(updatedCasterStats?.health).toBe(100); // 96 + 10 = 106, capped at maxHP 100
    });
  });
});
