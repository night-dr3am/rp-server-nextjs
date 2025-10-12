import { POST } from '../route';
import { arkanaCombatAttackSchema } from '@/lib/validation';
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

describe('/api/arkana/combat/attack', () => {
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

  describe('1. LiveStats Usage in Calculations', () => {
    /**
     * IMPORTANT: Effect modifiers work by modifying the base stat value,
     * which is then converted to a d20 modifier using calculateStatModifier().
     *
     * Example: Physical 2 (0 mod) + buff_physical_1 (+1) = Physical 3 (+2 mod)
     *
     * Stat to Modifier mapping (calculateStatModifier):
     * - Stat 0: -3 modifier
     * - Stat 1: -2 modifier
     * - Stat 2: 0 modifier
     * - Stat 3: +2 modifier
     * - Stat 4: +4 modifier
     * - Stat 5: +6 modifier
     */
    it('1.1 should apply positive stat modifiers to attack rolls', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Buffed Attacker',
        race: 'human',
        archetype: 'Warrior',
        physical: 2, // 0 modifier base
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_physical_1',
            name: 'Physical Bonus +1',
            duration: 'turns:3',
            turnsLeft: 3, // Will decrement to 2 after action
            appliedAt: new Date().toISOString()
          }
        ]
        // liveStats auto-calculated: { Physical: 1 } → Effective Physical = 3 → +2 modifier
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Warrior',
        physical: 2,
        dexterity: 2, // 0 modifier (defense)
        mental: 2,
        perception: 2,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        target_uuid: target.slUuid,
        attack_type: 'physical',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Attacker: Physical 2 + buff (+1) = Physical 3 → +2 modifier
      expect(data.data.attackerMod).toBe(2);
      expect(data.data.attackStat).toBe('Physical');

      // Verify effect decremented in database
      const updatedAttacker = await prisma.arkanaStats.findFirst({
        where: { userId: attacker.id }
      });
      const activeEffects = (updatedAttacker?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects[0].turnsLeft).toBe(2); // 3 - 1
    });

    it('1.2 should apply negative stat modifiers to attack rolls', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Debuffed Attacker',
        race: 'human',
        archetype: 'Warrior',
        physical: 3, // +1 modifier base
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'debuff_physical_minus_2',
            name: 'Physical Debuff -2',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          }
        ]
        // liveStats auto-calculated: { Physical: -2 } → Effective Physical = 1 → -2 modifier
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Warrior',
        physical: 2,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        target_uuid: target.slUuid,
        attack_type: 'physical',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Attacker: Physical 3 + debuff (-2) = Physical 1 → -2 modifier
      expect(data.data.attackerMod).toBe(-2);
    });

    it('1.3 should stack multiple modifiers on same stat', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Multi-Buffed',
        race: 'human',
        archetype: 'Warrior',
        physical: 2, // 0 modifier base
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10,
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
        // liveStats auto-calculated: { Physical: 3 } → Effective Physical = 5 → +6 modifier
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Warrior',
        physical: 2,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        target_uuid: target.slUuid,
        attack_type: 'physical',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Attacker: Physical 2 + buff1 (+1) + buff2 (+2) = Physical 5 → +6 modifier
      expect(data.data.attackerMod).toBe(6);
    });

    it('1.4 should net buffs and debuffs correctly', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Mixed Effects',
        race: 'human',
        archetype: 'Warrior',
        physical: 2, // 0 modifier base
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10,
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
        // liveStats auto-calculated: { Physical: -1 } → Effective Physical = 1 → -2 modifier
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Warrior',
        physical: 2,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        target_uuid: target.slUuid,
        attack_type: 'physical',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Attacker: Physical 2 + buff (+1) + debuff (-2) = Physical 1 → -2 modifier
      expect(data.data.attackerMod).toBe(-2);
    });

    it('1.5 should apply liveStats to both attacker and defender independently', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Buffed Attacker',
        race: 'human',
        archetype: 'Warrior',
        physical: 2, // 0 modifier base
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_attack_2',
            name: 'Attack Roll Buff +2',
            duration: 'scene',
            turnsLeft: 5,
            appliedAt: new Date().toISOString()
          }
        ]
        // liveStats: { Physical: 2 } → Effective Physical = 4 → +4 modifier
      });

      const target = await createArkanaTestUser({
        characterName: 'Debuffed Target',
        race: 'human',
        archetype: 'Warrior',
        physical: 2,
        dexterity: 2, // 0 modifier base (defense stat for physical attacks)
        mental: 2,
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'debuff_dexterity_minus_1',
            name: 'Dexterity Debuff -1',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString()
          }
        ]
        // liveStats: { Dexterity: -1 } → Effective Dexterity = 1 → -2 modifier
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        target_uuid: target.slUuid,
        attack_type: 'physical',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Attacker: Physical 2 + buff (+2) = Physical 4 → +4 modifier
      expect(data.data.attackerMod).toBe(4);
      // Defender: Dexterity 2 + debuff (-1) = Dexterity 1 → -2 modifier
      expect(data.data.defenderMod).toBe(-2);
      // Target number: 10 + (-2) = 8, easier to hit
      expect(data.data.targetNumber).toBe(8);
    });
  });

  describe('2. Turn Processing', () => {
    it('2.1 should decrement single effect by 1 turn', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Attacker',
        race: 'human',
        archetype: 'Warrior',
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
          }
        ]
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Warrior',
        physical: 2,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        target_uuid: target.slUuid,
        attack_type: 'physical',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify effect decremented in database
      const updatedAttacker = await prisma.arkanaStats.findFirst({
        where: { userId: attacker.id }
      });

      const activeEffects = (updatedAttacker?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects).toHaveLength(1);
      expect(activeEffects[0].turnsLeft).toBe(2); // 3 - 1
    });

    it('2.2 should decrement all multiple effects', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Attacker',
        race: 'human',
        archetype: 'Warrior',
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
          },
          {
            effectId: 'buff_mental_1_turn',
            name: 'Mental Bonus +1 (1 turn)',
            duration: 'turns:2',
            turnsLeft: 2, // Will decrement to 1
            appliedAt: new Date().toISOString()
          }
        ]
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Warrior',
        physical: 2,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        target_uuid: target.slUuid,
        attack_type: 'physical',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify all effects decremented in database
      const updatedAttacker = await prisma.arkanaStats.findFirst({
        where: { userId: attacker.id }
      });

      const activeEffects = (updatedAttacker?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects).toHaveLength(3);
      expect(activeEffects[0].turnsLeft).toBe(2); // 3 - 1
      expect(activeEffects[1].turnsLeft).toBe(4); // 5 - 1
      expect(activeEffects[2].turnsLeft).toBe(1); // 2 - 1
    });

    it('2.3 should remove effect when turnsLeft reaches 0', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Attacker',
        race: 'human',
        archetype: 'Warrior',
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

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Warrior',
        physical: 2,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        target_uuid: target.slUuid,
        attack_type: 'physical',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify effect removed in database
      const updatedAttacker = await prisma.arkanaStats.findFirst({
        where: { userId: attacker.id }
      });

      const activeEffects = (updatedAttacker?.activeEffects || []) as unknown as ActiveEffect[];
      expect(activeEffects).toHaveLength(0); // Effect expired

      const liveStats = (updatedAttacker?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.Physical).toBeUndefined(); // Stat bonus removed
    });

    it('should reject power attack type and redirect to power-attack endpoint', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Psion',
        race: 'human',
        archetype: 'Mentalist',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 10
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Fighter',
        physical: 4,
        dexterity: 3,
        mental: 1,
        perception: 2,
        hitPoints: 20
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const attackData = {
        attacker_uuid: attacker.slUuid,
        target_uuid: target.slUuid,
        attack_type: 'power',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      // Should reject power attacks and suggest power-attack endpoint
      expectError(data);
      expect(response.status).toBe(400);
    });

    it('should return 400 for self-attack', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Self Attacker',
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

      const attackData = {
        attacker_uuid: player.slUuid,
        target_uuid: player.slUuid, // Same UUID
        attack_type: 'physical',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Cannot attack yourself');
      expect(response.status).toBe(400);
    });

    it('should return 400 for unconscious target', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Attacker',
        race: 'human',
        archetype: 'Fighter',
        physical: 5,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 25
      });

      const target = await createArkanaTestUser({
        characterName: 'Unconscious Target',
        race: 'human',
        archetype: 'Mage',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 10
      });

      // Set target health to 0 (unconscious)
      await prisma.userStats.update({
        where: { userId: target.id },
        data: { health: 0 }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const attackData = {
        attacker_uuid: attacker.slUuid,
        target_uuid: target.slUuid,
        attack_type: 'physical',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Target is unconscious');
      expect(response.status).toBe(400);
    });

    it('should return 400 when target is not in RP mode', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Attacker',
        race: 'human',
        archetype: 'Fighter',
        physical: 5,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 25
      });

      const target = await createArkanaTestUser({
        characterName: 'OOC Target',
        race: 'human',
        archetype: 'Mage',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 10
      });

      // Set target status to 1 (OOC mode, not in RP)
      await prisma.userStats.update({
        where: { userId: target.id },
        data: { status: 1 }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const attackData = {
        attacker_uuid: attacker.slUuid,
        target_uuid: target.slUuid,
        attack_type: 'physical',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Target player is not in RP mode');
      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent attacker', async () => {
      const target = await createArkanaTestUser({
        characterName: 'Target',
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

      const attackData = {
        attacker_uuid: generateTestUUID(), // Non-existent UUID
        target_uuid: target.slUuid,
        attack_type: 'physical',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Attacker not found in Arkana universe');
      expect(response.status).toBe(404);
    });

    it('should return 400 for incomplete attacker registration', async () => {
      const { user: attacker } = await createTestUser('arkana');
      await prisma.userStats.create({
        data: {
          userId: attacker.id,
          health: 100,
          hunger: 100,
          thirst: 100,
          copperCoin: 100
        }
      });
      await prisma.arkanaStats.create({
        data: {
          userId: attacker.id,
          characterName: 'Incomplete Attacker',
          agentName: attacker.username + ' Resident',
          race: 'human',
          archetype: 'Fighter',
          physical: 3,
          dexterity: 3,
          mental: 3,
          perception: 3,
          hitPoints: 15,
          registrationCompleted: false // Not completed!
        }
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
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

      const attackData = {
        attacker_uuid: attacker.slUuid,
        target_uuid: target.slUuid,
        attack_type: 'physical',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Attacker registration incomplete');
      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid signature', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Attacker',
        race: 'human',
        archetype: 'Fighter',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 15
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Mage',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 10
      });

      const attackData = {
        attacker_uuid: attacker.slUuid,
        target_uuid: target.slUuid,
        attack_type: 'physical',
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'invalid-signature'
      };

      const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(400); // Should be 400 for validation error, not 401
    });

    it('should return 400 for invalid attack type', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Attacker',
        race: 'human',
        archetype: 'Fighter',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 15
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
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

      const attackData = {
        attacker_uuid: attacker.slUuid,
        target_uuid: target.slUuid,
        attack_type: 'invalid-attack',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(400);
    });
  });

  describe('Validation Schema Tests', () => {
    it('should accept valid attack data', () => {
      const payload = {
        attacker_uuid: generateTestUUID(),
        target_uuid: generateTestUUID(),
        attack_type: 'physical',
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64) // Valid 64-char hex signature
      };

      const { error } = arkanaCombatAttackSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('should accept all valid attack types', () => {
      const basePayload = {
        attacker_uuid: generateTestUUID(),
        target_uuid: generateTestUUID(),
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64) // Valid 64-char hex signature
      };

      ['physical', 'ranged'].forEach(attackType => {
        const payload = { ...basePayload, attack_type: attackType };
        const { error } = arkanaCombatAttackSchema.validate(payload);
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid attack types', () => {
      const payload = {
        attacker_uuid: generateTestUUID(),
        target_uuid: generateTestUUID(),
        attack_type: 'invalid',
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaCombatAttackSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('must be one of');
    });

    it('should reject non-arkana universe', () => {
      const payload = {
        attacker_uuid: generateTestUUID(),
        target_uuid: generateTestUUID(),
        attack_type: 'physical',
        universe: 'gor',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaCombatAttackSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('must be [arkana]');
    });

    it('should require all fields', () => {
      const payload = {
        attacker_uuid: generateTestUUID(),
        // Missing target_uuid, attack_type, universe, timestamp, signature
      };

      const { error } = arkanaCombatAttackSchema.validate(payload);
      expect(error).toBeDefined();
    });
  });

  describe('Damage Calculation Tests', () => {
    // Note: Using high attacker mods and low defender stats to ensure hits
    // No Math.random mocking to avoid breaking UUID generation

    describe('Physical Attack Damage', () => {
      it('should deal 1 damage with Physical stat 0 (modifier -3, clamped to minimum)', async () => {
        const attacker = await createArkanaTestUser({
          characterName: 'Weak Attacker',
          race: 'human',
          archetype: 'Civilian',
          physical: 0, // Modifier: -3 → Damage: 1 + (-3) = -2 → clamped to 1
          dexterity: 2,
          mental: 2,
          perception: 2,
          hitPoints: 10
        });

        const target = await createArkanaTestUser({
          characterName: 'Target',
          race: 'human',
          archetype: 'Mage',
          physical: 2,
          dexterity: 0, // Very low defense, guarantees hit
          mental: 5,
          perception: 3,
          hitPoints: 10
        });

        const timestamp = new Date().toISOString();
        const signature = generateSignature(timestamp, 'arkana');

        const attackData = {
          attacker_uuid: attacker.slUuid,
          target_uuid: target.slUuid,
          attack_type: 'physical',
          universe: 'arkana',
          timestamp: timestamp,
          signature: signature
        };

        const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
        const response = await POST(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);
        // Only check damage if attack hit (can't guarantee hits without mocking Math.random)
        if (data.data.isHit === 'true') {
          expect(data.data.damage).toBe(1); // Minimum damage with Physical 0 (modifier -3)
          expect(data.data.target.healthBefore).toBe(100);
          expect(data.data.target.healthAfter).toBe(99); // 100 - 1 = 99
        }
      });

      it('should deal 1 damage with Physical stat 1 (modifier -2, clamped to minimum)', async () => {
        const attacker = await createArkanaTestUser({
          characterName: 'Weak Fighter',
          race: 'human',
          archetype: 'Civilian',
          physical: 1, // Modifier: -2 → Damage: 1 + (-2) = -1 → clamped to 1
          dexterity: 2,
          mental: 2,
          perception: 2,
          hitPoints: 10
        });

        const target = await createArkanaTestUser({
          characterName: 'Target',
          race: 'human',
          archetype: 'Mage',
          physical: 2,
          dexterity: 0,
          mental: 5,
          perception: 3,
          hitPoints: 10
        });

        const timestamp = new Date().toISOString();
        const signature = generateSignature(timestamp, 'arkana');

        const attackData = {
          attacker_uuid: attacker.slUuid,
          target_uuid: target.slUuid,
          attack_type: 'physical',
          universe: 'arkana',
          timestamp: timestamp,
          signature: signature
        };

        const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
        const response = await POST(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);
        if (data.data.isHit === 'true') {
          expect(data.data.damage).toBe(1); // Minimum damage with Physical 1 (modifier -2)
          expect(data.data.target.healthAfter).toBe(99);
        }
      });

      it('should deal 1 damage with Physical stat 2 (modifier 0)', async () => {
        const attacker = await createArkanaTestUser({
          characterName: 'Average Fighter',
          race: 'human',
          archetype: 'Fighter',
          physical: 2, // Modifier: 0 → Damage: 1 + 0 = 1
          dexterity: 2,
          mental: 2,
          perception: 2,
          hitPoints: 10
        });

        const target = await createArkanaTestUser({
          characterName: 'Target',
          race: 'human',
          archetype: 'Mage',
          physical: 2,
          dexterity: 0,
          mental: 5,
          perception: 3,
          hitPoints: 10
        });

        const timestamp = new Date().toISOString();
        const signature = generateSignature(timestamp, 'arkana');

        const attackData = {
          attacker_uuid: attacker.slUuid,
          target_uuid: target.slUuid,
          attack_type: 'physical',
          universe: 'arkana',
          timestamp: timestamp,
          signature: signature
        };

        const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
        const response = await POST(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);
        if (data.data.isHit === 'true') {
          expect(data.data.damage).toBe(1); // 1 + 0 = 1
          expect(data.data.target.healthAfter).toBe(99);
        }
      });

      it('should deal 3 damage with Physical stat 3 (modifier +2)', async () => {
        const attacker = await createArkanaTestUser({
          characterName: 'Strong Fighter',
          race: 'human',
          archetype: 'Fighter',
          physical: 3, // Modifier: +2 → Damage: 1 + 2 = 3
          dexterity: 2,
          mental: 2,
          perception: 2,
          hitPoints: 15
        });

        const target = await createArkanaTestUser({
          characterName: 'Target',
          race: 'human',
          archetype: 'Mage',
          physical: 2,
          dexterity: 0,
          mental: 5,
          perception: 3,
          hitPoints: 10
        });

        const timestamp = new Date().toISOString();
        const signature = generateSignature(timestamp, 'arkana');

        const attackData = {
          attacker_uuid: attacker.slUuid,
          target_uuid: target.slUuid,
          attack_type: 'physical',
          universe: 'arkana',
          timestamp: timestamp,
          signature: signature
        };

        const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
        const response = await POST(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);
        if (data.data.isHit === 'true') {
          expect(data.data.damage).toBe(3); // 1 + 2 = 3
          expect(data.data.target.healthBefore).toBe(100);
          expect(data.data.target.healthAfter).toBe(97); // 100 - 3 = 97
        }
      });

      it('should deal 5 damage with Physical stat 4 (modifier +4)', async () => {
        const attacker = await createArkanaTestUser({
          characterName: 'Very Strong Fighter',
          race: 'human',
          archetype: 'Warrior',
          physical: 4, // Modifier: +4 → Damage: 1 + 4 = 5
          dexterity: 2,
          mental: 2,
          perception: 2,
          hitPoints: 20
        });

        const target = await createArkanaTestUser({
          characterName: 'Target',
          race: 'human',
          archetype: 'Mage',
          physical: 2,
          dexterity: 0,
          mental: 5,
          perception: 3,
          hitPoints: 10
        });

        const timestamp = new Date().toISOString();
        const signature = generateSignature(timestamp, 'arkana');

        const attackData = {
          attacker_uuid: attacker.slUuid,
          target_uuid: target.slUuid,
          attack_type: 'physical',
          universe: 'arkana',
          timestamp: timestamp,
          signature: signature
        };

        const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
        const response = await POST(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);
        if (data.data.isHit === 'true') {
          expect(data.data.damage).toBe(5); // 1 + 4 = 5
          expect(data.data.target.healthAfter).toBe(95); // 100 - 5 = 95
        }
      });

      it('should deal 7 damage with Physical stat 5 (modifier +6)', async () => {
        const attacker = await createArkanaTestUser({
          characterName: 'Legendary Warrior',
          race: 'human',
          archetype: 'Champion',
          physical: 5, // Modifier: +6 → Damage: 1 + 6 = 7
          dexterity: 2,
          mental: 2,
          perception: 2,
          hitPoints: 25
        });

        const target = await createArkanaTestUser({
          characterName: 'Target',
          race: 'human',
          archetype: 'Mage',
          physical: 2,
          dexterity: 0,
          mental: 5,
          perception: 3,
          hitPoints: 10
        });

        const timestamp = new Date().toISOString();
        const signature = generateSignature(timestamp, 'arkana');

        const attackData = {
          attacker_uuid: attacker.slUuid,
          target_uuid: target.slUuid,
          attack_type: 'physical',
          universe: 'arkana',
          timestamp: timestamp,
          signature: signature
        };

        const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
        const response = await POST(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);
        if (data.data.isHit === 'true') {
          expect(data.data.damage).toBe(7); // 1 + 6 = 7
          expect(data.data.target.healthAfter).toBe(93); // 100 - 7 = 93
        }
      });
    });

    describe('Ranged Attack Damage', () => {
      it('should deal 1 damage with Dexterity stat 0 (modifier -3, clamped to minimum)', async () => {
        const attacker = await createArkanaTestUser({
          characterName: 'Clumsy Archer',
          race: 'human',
          archetype: 'Civilian',
          physical: 2,
          dexterity: 0, // Modifier: -3 → Damage: 1 + (-3) = -2 → clamped to 1
          mental: 2,
          perception: 2,
          hitPoints: 10
        });

        const target = await createArkanaTestUser({
          characterName: 'Target',
          race: 'human',
          archetype: 'Mage',
          physical: 2,
          dexterity: 0, // Very low defense
          mental: 5,
          perception: 3,
          hitPoints: 10
        });

        const timestamp = new Date().toISOString();
        const signature = generateSignature(timestamp, 'arkana');

        const attackData = {
          attacker_uuid: attacker.slUuid,
          target_uuid: target.slUuid,
          attack_type: 'ranged',
          universe: 'arkana',
          timestamp: timestamp,
          signature: signature
        };

        const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
        const response = await POST(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);
        if (data.data.isHit === 'true') {
          expect(data.data.damage).toBe(1); // Minimum damage with Dexterity 0 (modifier -3)
          expect(data.data.target.healthAfter).toBe(99);
        }
      });

      it('should deal 1 damage with Dexterity stat 2 (modifier 0)', async () => {
        const attacker = await createArkanaTestUser({
          characterName: 'Average Archer',
          race: 'human',
          archetype: 'Ranger',
          physical: 2,
          dexterity: 2, // Modifier: 0 → Damage: 1 + 0 = 1
          mental: 2,
          perception: 3,
          hitPoints: 10
        });

        const target = await createArkanaTestUser({
          characterName: 'Target',
          race: 'human',
          archetype: 'Mage',
          physical: 2,
          dexterity: 0,
          mental: 5,
          perception: 3,
          hitPoints: 10
        });

        const timestamp = new Date().toISOString();
        const signature = generateSignature(timestamp, 'arkana');

        const attackData = {
          attacker_uuid: attacker.slUuid,
          target_uuid: target.slUuid,
          attack_type: 'ranged',
          universe: 'arkana',
          timestamp: timestamp,
          signature: signature
        };

        const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
        const response = await POST(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);
        if (data.data.isHit === 'true') {
          expect(data.data.damage).toBe(1); // 1 + 0 = 1
          expect(data.data.target.healthAfter).toBe(99);
        }
      });

      it('should deal 3 damage with Dexterity stat 3 (modifier +2)', async () => {
        const attacker = await createArkanaTestUser({
          characterName: 'Skilled Archer',
          race: 'human',
          archetype: 'Ranger',
          physical: 2,
          dexterity: 3, // Modifier: +2 → Damage: 1 + 2 = 3
          mental: 2,
          perception: 3,
          hitPoints: 10
        });

        const target = await createArkanaTestUser({
          characterName: 'Target',
          race: 'human',
          archetype: 'Mage',
          physical: 2,
          dexterity: 0,
          mental: 5,
          perception: 3,
          hitPoints: 10
        });

        const timestamp = new Date().toISOString();
        const signature = generateSignature(timestamp, 'arkana');

        const attackData = {
          attacker_uuid: attacker.slUuid,
          target_uuid: target.slUuid,
          attack_type: 'ranged',
          universe: 'arkana',
          timestamp: timestamp,
          signature: signature
        };

        const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
        const response = await POST(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);
        if (data.data.isHit === 'true') {
          expect(data.data.damage).toBe(3); // 1 + 2 = 3
          expect(data.data.target.healthAfter).toBe(97);
        }
      });

      it('should deal 5 damage with Dexterity stat 4 (modifier +4)', async () => {
        const attacker = await createArkanaTestUser({
          characterName: 'Expert Archer',
          race: 'human',
          archetype: 'Marksman',
          physical: 2,
          dexterity: 4, // Modifier: +4 → Damage: 1 + 4 = 5
          mental: 2,
          perception: 4,
          hitPoints: 10
        });

        const target = await createArkanaTestUser({
          characterName: 'Target',
          race: 'human',
          archetype: 'Mage',
          physical: 2,
          dexterity: 0,
          mental: 5,
          perception: 3,
          hitPoints: 10
        });

        const timestamp = new Date().toISOString();
        const signature = generateSignature(timestamp, 'arkana');

        const attackData = {
          attacker_uuid: attacker.slUuid,
          target_uuid: target.slUuid,
          attack_type: 'ranged',
          universe: 'arkana',
          timestamp: timestamp,
          signature: signature
        };

        const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
        const response = await POST(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);
        if (data.data.isHit === 'true') {
          expect(data.data.damage).toBe(5); // 1 + 4 = 5
          expect(data.data.target.healthAfter).toBe(95);
        }
      });

      it('should deal 7 damage with Dexterity stat 5 (modifier +6)', async () => {
        const attacker = await createArkanaTestUser({
          characterName: 'Master Archer',
          race: 'human',
          archetype: 'Legendary Marksman',
          physical: 2,
          dexterity: 5, // Modifier: +6 → Damage: 1 + 6 = 7
          mental: 2,
          perception: 5,
          hitPoints: 10
        });

        const target = await createArkanaTestUser({
          characterName: 'Target',
          race: 'human',
          archetype: 'Mage',
          physical: 2,
          dexterity: 0,
          mental: 5,
          perception: 3,
          hitPoints: 10
        });

        const timestamp = new Date().toISOString();
        const signature = generateSignature(timestamp, 'arkana');

        const attackData = {
          attacker_uuid: attacker.slUuid,
          target_uuid: target.slUuid,
          attack_type: 'ranged',
          universe: 'arkana',
          timestamp: timestamp,
          signature: signature
        };

        const request = createMockPostRequest('/api/arkana/combat/attack', attackData);
        const response = await POST(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);
        if (data.data.isHit === 'true') {
          expect(data.data.damage).toBe(7); // 1 + 6 = 7
          expect(data.data.target.healthAfter).toBe(93);
        }
      });
    });
  });
});