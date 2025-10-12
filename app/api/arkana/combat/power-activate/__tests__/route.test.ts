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
import { recalculateLiveStats } from '@/lib/arkana/effectsUtils';

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
    commonPowers?: string[];
    archetypePowers?: string[];
    activeEffects?: ActiveEffect[];
    liveStats?: LiveStats;
    status?: number; // Add status for RP mode testing
  }) {
    const { user } = await createTestUser('arkana');

    // Create user stats with specified status (default 0 = RP mode)
    await prisma.userStats.create({
      data: {
        userId: user.id,
        health: 100,
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
      expect(data.data.caster.turnsRemaining).toBeDefined();
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
    it('2.1 should decrement all active effects by 1 turn', async () => {
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
            turnsLeft: 2,
            appliedAt: new Date().toISOString()
          }
        ],
        liveStats: { Dexterity: 3, Physical: 1 }
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
      expect(data.data.caster.turnsRemaining).toBe(2); // Both effects still active

      // Verify in database
      const updatedCaster = await prisma.arkanaStats.findFirst({
        where: { userId: caster.id }
      });

      const activeEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects).toHaveLength(2);
      expect(activeEffects[0].turnsLeft).toBe(2); // 3 - 1
      expect(activeEffects[1].turnsLeft).toBe(1); // 2 - 1
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
        liveStats: { Dexterity: 3 }
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
      expect(data.data.caster.turnsRemaining).toBe(0); // Effect expired

      // Verify in database
      const updatedCaster = await prisma.arkanaStats.findFirst({
        where: { userId: caster.id }
      });

      const activeEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects).toHaveLength(0); // Effect removed

      const liveStats = (updatedCaster?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.Dexterity).toBeUndefined(); // Stat bonus removed
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
        liveStats: { Stealth: 3 }
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
      expect(data.data.caster.turnsRemaining).toBe(1); // Effect still active

      // Verify in database
      const updatedCaster = await prisma.arkanaStats.findFirst({
        where: { userId: caster.id }
      });

      const activeEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects).toHaveLength(1);
      expect(activeEffects[0].turnsLeft).toBe(998); // 999 - 1

      const liveStats = (updatedCaster?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.Stealth).toBe(3); // Still active
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
            duration: 'turns:2',
            turnsLeft: 1, // Expires
            appliedAt: new Date().toISOString()
          },
          {
            effectId: 'buff_physical_1',
            name: 'Physical Bonus +1',
            duration: 'scene',
            turnsLeft: 1, // Expires
            appliedAt: new Date().toISOString()
          },
          {
            effectId: 'buff_stealth_3',
            name: 'Stealth Bonus +3',
            duration: 'scene',
            turnsLeft: 3, // Persists
            appliedAt: new Date().toISOString()
          }
        ],
        liveStats: { Dexterity: 3, Physical: 1, Stealth: 3 }
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
      expect(data.data.caster.turnsRemaining).toBe(1); // Only 1 effect remains

      // Verify in database
      const updatedCaster = await prisma.arkanaStats.findFirst({
        where: { userId: caster.id }
      });

      const activeEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects).toHaveLength(1);
      expect(activeEffects[0].effectId).toBe('buff_stealth_3');

      const liveStats = (updatedCaster?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.Dexterity).toBeUndefined();
      expect(liveStats.Physical).toBeUndefined();
      expect(liveStats.Stealth).toBe(3); // Only this remains
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
        liveStats: { Physical: 1, Mental: -1 }
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
      expect(liveStats.Physical).toBe(1); // Still active
      expect(liveStats.Mental).toBeUndefined(); // Expired and removed
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
        expect(liveStats.Dexterity).toBe(3); // Chi Step applies +3 Dexterity
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
      expect(liveStats.Physical).toBe(3);
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
      expect(liveStats.Physical).toBe(-2);
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
      // +1 + (-2) = -1
      expect(liveStats.Physical).toBe(-1);
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
      expect(liveStats.Stealth).toBeUndefined();
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
            duration: 'scene',
            turnsLeft: 1, // Will expire
            appliedAt: new Date().toISOString()
          }
        ],
        liveStats: { Physical: 1 }
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
      expect(data.data.rollInfo).toMatch(/Roll: \d+\+-2=\d+ vs TN:10/);
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
        expect(dexBuff?.turnsLeft).toBe(1); // turns:2 minus 1 for turn processing

        const liveStats = (updatedCaster?.liveStats || {}) as unknown as LiveStats;
        expect(liveStats.Dexterity).toBe(3);
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

      // Verify scene duration
      const updatedCaster = await prisma.arkanaStats.findFirst({
        where: { userId: caster.id }
      });

      const activeEffects = (updatedCaster?.activeEffects || []) as unknown as ActiveEffect[];
      const stealthBuff = activeEffects.find(e => e.effectId === 'buff_stealth_4');
      expect(stealthBuff).toBeDefined();
      expect(stealthBuff?.turnsLeft).toBe(998); // 999 - 1 for turn processing
      expect(stealthBuff?.duration).toBe('scene');
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
        expect(dexBuff?.turnsLeft).toBe(1); // Decremented, not refreshed
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
      expect(liveStats.Physical).toBe(3); // 1 + 2
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
      expect(liveStats.Physical).toBe(-1); // 1 + (-2)
    });
  });

  describe('6. Multi-Target Tests', () => {
    it('6.2 self-targeted power applies to caster', async () => {
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
        expect(liveStats.Dexterity).toBeDefined();
      } else {
        console.log('Chi Step activation failed check, skipping self-target verification');
      }
    });
  });

  describe('7. Power-Attack vs Power-Activate Comparison', () => {
    it('7.1 power-attack does NOT process turn', async () => {
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
        liveStats: { Dexterity: 3 }
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

      // Verify attacker's effects NOT decremented
      const updatedAttacker = await prisma.arkanaStats.findFirst({
        where: { userId: attacker.id }
      });

      const activeEffects = (updatedAttacker?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects[0].turnsLeft).toBe(3); // NOT decremented
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
        liveStats: { Dexterity: 3 }
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
      expect(data.data.caster.turnsRemaining).toBeDefined();
      expect(data.data.message).toBeDefined();
    });

    it('9.4 should return turnsRemaining count in response', async () => {
      const caster = await createArkanaTestUser({
        characterName: 'Multi Effect Caster',
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
            turnsLeft: 5,
            appliedAt: new Date().toISOString()
          },
          {
            effectId: 'buff_stealth_3',
            name: 'Stealth Bonus +3',
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
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-activate', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.caster.turnsRemaining).toBe(3); // All 3 still active after turn
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

      expectError(data, 'Power not found');
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
      expect(data.data.caster.turnsRemaining).toBe(0);
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
      expect(liveStats.Dexterity).toBe(3); // Recalculated
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
        expect(activeEffects[0].turnsLeft).toBe(1); // turns:2 minus 1 for turn

        const liveStats = (updatedCaster?.liveStats || {}) as unknown as LiveStats;
        expect(liveStats.Dexterity).toBe(3);
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

      // Step 5: Verify buff expired (was at turns:1, now 0) - only if first activation succeeded
      const updatedCaster2 = await prisma.arkanaStats.findFirst({
        where: { userId: caster.id }
      });

      const activeEffects2 = (updatedCaster2?.activeEffects || []) as unknown as ActiveEffect[];

      // If first activation succeeded, buff should have expired now after second activation
      if (firstActivationSucceeded) {
        expect(activeEffects2.length).toBe(0); // Buff expired

        const liveStats2 = (updatedCaster2?.liveStats || {}) as unknown as LiveStats;
        expect(liveStats2.Dexterity).toBeUndefined(); // Effect removed
      }

      // Step 6: Verify target was affected by second power
      const updatedTarget = await prisma.arkanaStats.findFirst({
        where: { userId: target.id }
      });

      // Chi manipulation is a restore ability, won't add debuffs in ability mode
      expect(updatedTarget).toBeDefined();
    });
  });
});
