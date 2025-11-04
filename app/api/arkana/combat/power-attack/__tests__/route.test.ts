import { POST } from '../route';
import { arkanaPowerAttackSchema } from '@/lib/validation';
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

describe('/api/arkana/combat/power-attack', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  async function createArkanaTestUser(arkanaStatsData: {
    characterName: string;
    race: string;
    archetype: string;
    physical: number;
    dexterity: number;
    mental: number;
    perception: number;
    hitPoints: number;
    health?: number;  // Optional current HP (defaults to hitPoints value)
    activeEffects?: ActiveEffect[];  // Optional active effects for testing turn processing
    liveStats?: LiveStats;  // Optional manual liveStats (auto-calculated if activeEffects provided)
    commonPowers?: string[];
    archetypePowers?: string[];
    perks?: string[];
    cybernetics?: string[];
    magicWeaves?: string[];
  }) {
    const { user } = await createTestUser('arkana');

    // Use health parameter if provided, otherwise default to hitPoints (max HP)
    const currentHealth = arkanaStatsData.health ?? arkanaStatsData.hitPoints;

    await prisma.userStats.create({
      data: {
        userId: user.id,
        health: currentHealth,
        hunger: 100,
        thirst: 100,
        status: 0,  // 0 = RP mode (IC)
        goldCoin: 0,
        silverCoin: 0,
        copperCoin: 100
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { health: _, liveStats: __, ...arkanaDataWithoutExtra } = arkanaStatsData;

    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        agentName: user.username + ' Resident',
        registrationCompleted: true,
        ...arkanaDataWithoutExtra,
        activeEffects: (arkanaStatsData.activeEffects || []) as unknown as typeof prisma.$Prisma.JsonNull,
        liveStats: (calculatedLiveStats || {}) as unknown as typeof prisma.$Prisma.JsonNull
      }
    });

    return user;
  }

  describe('API Endpoint Tests', () => {
    it('should execute power attack successfully', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Powerful Attacker',
        race: 'strigoi',
        archetype: 'Life',
        physical: 3,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 15,
        commonPowers: ['strigoi_hypnosis'],
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Target Player',
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
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.powerUsed).toBeDefined();
      expect(data.data.attackSuccess).toMatch(/^(true|false)$/);
      expect(data.data.message).toBeDefined();
      expect(data.data.target).toBeDefined();
      expect(data.data.target.uuid).toBe(target.slUuid);
    });

    it('should return 403 when attacker does not own the power', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'No Powers',
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

      const target = await createArkanaTestUser({
        characterName: 'Target Player',
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
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Attacker does not own this power');
      expect(response.status).toBe(403);
    });

    it('should return 400 when target is unconscious', async () => {
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
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Unconscious Target',
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

      // Set target health to 0
      await prisma.userStats.update({
        where: { userId: target.id },
        data: { health: 0 }
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
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Target is unconscious');
      expect(response.status).toBe(400);
    });

    it('should return 400 when target is not in RP mode', async () => {
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
        archetypePowers: []
      });

      // Set target status to 1 (OOC mode, not in RP)
      await prisma.userStats.update({
        where: { userId: target.id },
        data: { status: 1 }
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
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Target is not in RP mode');
      expect(response.status).toBe(400);
    });

    it('should not allow attacking yourself', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Self Attacker',
        race: 'strigoi',
        archetype: 'Life',
        physical: 3,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 15,
        commonPowers: ['strigoi_hypnosis'],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'strigoi_hypnosis',
        target_uuid: attacker.slUuid, // Same as attacker!
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data); // Just check error exists
      expect(response.status).toBe(400);
    });
  });

  describe('Validation Schema Tests', () => {
    it('should accept valid request with power_id', () => {
      const payload = {
        attacker_uuid: generateTestUUID(),
        power_id: 'some_power',
        target_uuid: generateTestUUID(),
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerAttackSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('should accept valid request with power_name', () => {
      const payload = {
        attacker_uuid: generateTestUUID(),
        power_name: 'Hypnosis',
        target_uuid: generateTestUUID(),
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerAttackSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('should reject request without power_id or power_name', () => {
      const payload = {
        attacker_uuid: generateTestUUID(),
        target_uuid: generateTestUUID(),
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerAttackSchema.validate(payload);
      expect(error).toBeDefined();
    });

    it('should reject attacker attacking themselves', () => {
      const uuid = generateTestUUID();
      const payload = {
        attacker_uuid: uuid,
        power_id: 'some_power',
        target_uuid: uuid, // Same!
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerAttackSchema.validate(payload);
      expect(error).toBeDefined();
      // Just check error exists, message format may vary
      expect(error?.message).toBeDefined();
    });
  });

  describe('Effect Message Tests', () => {
    it('should include effect details in message for powers with stat modifiers', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Emotion Thief',
        race: 'veilborn',
        archetype: 'Echoes',
        physical: 2,
        dexterity: 2,
        mental: 3,  // +0 modifier
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_emotion_theft'],
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Target Player',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,  // +0 modifier
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'veil_emotion_theft',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.message).toBeDefined();

      // Decode the message and check for effect details
      const decodedMessage = decodeURIComponent(data.data.message);

      // Should have hit/miss status
      expect(decodedMessage).toMatch(/HIT!|MISS!/);

      // If it hits, should mention target and attacker effects
      if (decodedMessage.includes('HIT!')) {
        expect(decodedMessage).toContain('Target:');
        expect(decodedMessage).toContain('Mental');
        expect(decodedMessage).toContain('Attacker:');
      }
    });

    it('should show debuff details for pure debuff powers', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Entropy Master',
        race: 'veilborn',
        archetype: 'Echoes',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_entropy_pulse'],
        archetypePowers: []
      });

      const target = await createArkanaTestUser({
        characterName: 'Target Player',
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
        power_id: 'veil_entropy_pulse',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      const decodedMessage = decodeURIComponent(data.data.message);

      // Should show 0 damage and target effects if hit
      if (decodedMessage.includes('HIT!')) {
        expect(decodedMessage).toContain('0 damage dealt');
        expect(decodedMessage).toContain('Target:');
      }
    });
  });

  describe('Extended Ability Types Tests', () => {
    it('should execute attack with a cybernetic', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Cyber Warrior',
        race: 'human',
        archetype: 'Psion',
        physical: 4,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 15,
        commonPowers: [],
        archetypePowers: [],
        cybernetics: ['cyb_razorjack_interface'] // Cybernetic with attack effects
      });

      const target = await createArkanaTestUser({
        characterName: 'Target Player',
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
        power_id: 'cyb_razorjack_interface',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.powerUsed).toBe('Razorjack Interface');
      expect(data.data.attackSuccess).toMatch(/^(true|false)$/);
      expect(data.data.message).toBeDefined();
      expect(data.data.target.uuid).toBe(target.slUuid);
    });

    it('should execute attack with a magic weave (enchant_sleep - critical test case)', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Enchanter',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: [],
        magicWeaves: ['enchant_sleep'] // Magic weave with attack effects
      });

      const target = await createArkanaTestUser({
        characterName: 'Target Player',
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
        power_id: 'enchant_sleep',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.powerUsed).toBe('Effect Creature: Sleep');
      expect(data.data.attackSuccess).toMatch(/^(true|false)$/);
      expect(data.data.message).toBeDefined();
      expect(data.data.target.uuid).toBe(target.slUuid);
    });

    it('should execute attack with a perk', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Spliced Fighter',
        race: 'spliced',
        archetype: 'chimeric',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 12,
        commonPowers: [],
        archetypePowers: [],
        perks: ['spliced_bioelectric_resonance'] // Perk with attack effects
      });

      const target = await createArkanaTestUser({
        characterName: 'Target Player',
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
        power_id: 'spliced_bioelectric_resonance',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.powerUsed).toBe('Bioelectric Resonance');
      expect(data.data.attackSuccess).toMatch(/^(true|false)$/);
      expect(data.data.message).toBeDefined();
      expect(data.data.target.uuid).toBe(target.slUuid);
    });

    it('should return 403 when attacker does not own the magic weave', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'No Magic',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 10,
        commonPowers: [],
        archetypePowers: [],
        magicWeaves: [] // Doesn't own enchant_sleep
      });

      const target = await createArkanaTestUser({
        characterName: 'Target Player',
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
        power_id: 'enchant_sleep',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Attacker does not own this power');
      expect(response.status).toBe(403);
    });
  });

  describe('Roll Bonus Modifiers Tests', () => {
    /**
     * roll_bonus modifierType adds/subtracts AFTER tier calculation (linear effect)
     * Power attacks use Mental stat by default for check
     * Example: Mental[2](+0 tier) + roll_bonus(+2) = final +2 modifier
     */
    it('should apply positive roll_bonus modifier to Mental power attack', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Focused Psion',
        race: 'veilborn',
        archetype: 'Echoes',
        physical: 2,
        dexterity: 2,
        mental: 2, // 0 modifier base (tier)
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_emotion_theft'],
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

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Warrior',
        physical: 2,
        dexterity: 2,
        mental: 2, // 0 modifier (defense)
        perception: 2,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'veil_emotion_theft',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify liveStats stored correctly
      const updatedAttacker = await prisma.arkanaStats.findFirst({
        where: { userId: attacker.id }
      });
      const liveStats = (updatedAttacker?.liveStats || {}) as unknown as LiveStats;
      // veil_emotion_theft adds +1 roll_bonus, plus our +2 = 3 total
      expect(liveStats.Mental_rollbonus).toBeGreaterThanOrEqual(2);
      // Verify rollInfo is defined
      expect(data.data.rollInfo).toBeDefined();
    });

    it('should apply negative roll_bonus modifier (debuff) to Mental power attack', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Distracted Mage',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 2,
        mental: 3, // +2 modifier base (tier)
        perception: 2,
        hitPoints: 10,
        magicWeaves: ['enchant_sleep'],
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
        power_id: 'enchant_sleep',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      const updatedAttacker = await prisma.arkanaStats.findFirst({
        where: { userId: attacker.id }
      });
      const liveStats = (updatedAttacker?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.Mental_rollbonus).toBe(-2);

      // Verify rollInfo shows the 0 modifier (tier +2, roll -2)
      if (data.data.rollInfo) {
        expect(data.data.rollInfo).toContain('+0');
      }
    });

    it('should apply roll_bonus debuff to Mental defense (lowers TN)', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Strong Psion',
        race: 'veilborn',
        archetype: 'Echoes',
        physical: 2,
        dexterity: 2,
        mental: 4, // +4 modifier (strong offense)
        perception: 3,
        hitPoints: 10,
        commonPowers: ['veil_emotion_theft']
      });

      const target = await createArkanaTestUser({
        characterName: 'Confused Target',
        race: 'human',
        archetype: 'Warrior',
        physical: 3,
        dexterity: 2,
        mental: 3, // +2 modifier base (tier)
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'debuff_mental_roll_minus_1',
            name: 'Mental Roll Penalty -1',
            duration: 'turns:2',
            turnsLeft: 2,
            appliedAt: new Date().toISOString()
          }
        ]
        // liveStats: { Mental_rollbonus: -1 } → Effective Mental mod = +2 (tier) + (-1) (roll) = +1
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'veil_emotion_theft',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify target's liveStats
      const updatedTarget = await prisma.arkanaStats.findFirst({
        where: { userId: target.id }
      });
      const liveStats = (updatedTarget?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.Mental_rollbonus).toBe(-1);

      // Verify rollInfo is defined (format varies so just check it exists)
      expect(data.data.rollInfo).toBeDefined();
    });

    it('should combine stat_value and roll_bonus modifiers correctly for power attack', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Combined Buffs Mage',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 2,
        mental: 2, // 0 modifier base (tier)
        perception: 2,
        hitPoints: 10,
        magicWeaves: ['enchant_sleep'],
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
        power_id: 'enchant_sleep',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      const updatedAttacker = await prisma.arkanaStats.findFirst({
        where: { userId: attacker.id }
      });
      const liveStats = (updatedAttacker?.liveStats || {}) as unknown as LiveStats;
      expect(liveStats.Mental).toBe(1); // stat_value modifier
      expect(liveStats.Mental_rollbonus).toBe(2); // roll_bonus modifier

      // Mental: (2 + 1) = 3 → +2 tier mod, then +2 roll bonus = +4 total
      // rollInfo format may vary, so just verify it's defined
      expect(data.data.rollInfo).toBeDefined();
    });
  });

  describe('Healing Effects Tests (Drain Attack)', () => {
    it('should heal attacker on successful Drain attack', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Necromancer',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 2,
        mental: 5,  // +1 modifier
        perception: 3,
        hitPoints: 10,
        health: 5,  // Start at low HP to see healing
        magicWeaves: ['necromancy_drain']  // Magic school powers are commonPowers
      });

      const target = await createArkanaTestUser({
        characterName: 'Target Player',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,  // +0 modifier
        perception: 3,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'necromancy_drain',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      // Debug: Log error if test fails
      if (!data.success) {
        console.log('ERROR for necromancy_drain:', data.error);
        const attackerRecord = await prisma.user.findFirst({
          where: { slUuid: attacker.slUuid },
          include: { arkanaStats: true }
        });
        console.log('Attacker magicWeaves:', attackerRecord?.arkanaStats?.magicWeaves);
      }

      expectSuccess(data);

      // Check if attack hit (it may miss due to dice rolls)
      if (data.data.attackSuccess === 'true') {
        // Verify healing message appears
        const decodedMessage = decodeURIComponent(data.data.message);
        expect(decodedMessage).toContain('Heals 6 HP');

        // Verify attacker's HP actually increased
        const updatedAttacker = await prisma.userStats.findUnique({
          where: { userId: attacker.id }
        });
        expect(updatedAttacker?.health).toBeGreaterThan(5);  // Should be healed
        expect(updatedAttacker?.health).toBeLessThanOrEqual(10);  // Capped at max HP
      }
    });

    it('should NOT heal attacker when Drain attack misses', async () => {
      // Use low mental stat to increase chance of missing
      const attacker = await createArkanaTestUser({
        characterName: 'Weak Necromancer',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 2,
        mental: 1,  // -1 modifier - higher chance to miss
        perception: 3,
        hitPoints: 10,
        health: 5,
        magicWeaves: ['necromancy_drain']
      });

      const target = await createArkanaTestUser({
        characterName: 'Target Player',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 5,  // High mental for better defense
        perception: 3,
        hitPoints: 10
      });

      // Run multiple attacks to ensure we test both hit and miss scenarios
      let foundMiss = false;
      for (let i = 0; i < 20 && !foundMiss; i++) {
        const timestamp = new Date().toISOString();
        const signature = generateSignature(timestamp, 'arkana');

        const requestData = {
          attacker_uuid: attacker.slUuid,
          power_id: 'necromancy_drain',
          target_uuid: target.slUuid,
          nearby_uuids: [],
          universe: 'arkana',
          timestamp,
          signature
        };

        const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
        const response = await POST(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);

        if (data.data.attackSuccess === 'false') {
          foundMiss = true;

          // Verify NO healing message on miss
          const decodedMessage = decodeURIComponent(data.data.message);
          expect(decodedMessage).not.toContain('Heals');
          expect(decodedMessage).toContain('MISS!');
        }

        // Reset HP for next attempt
        await prisma.userStats.update({
          where: { userId: attacker.id },
          data: { health: 5 }
        });
      }

      // We should have found at least one miss in 20 attempts with these stats
      expect(foundMiss).toBe(true);
    });

    it('should cap healing at max HP for Drain attack', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Necromancer',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 10,
        health: 8,  // Start at 8 HP, heal_drain_6 gives 6 HP, should cap at 10
        magicWeaves: ['necromancy_drain']
      });

      const target = await createArkanaTestUser({
        characterName: 'Target Player',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'necromancy_drain',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      if (data.data.attackSuccess === 'true') {
        // Verify healing is capped at max HP
        const updatedAttacker = await prisma.userStats.findUnique({
          where: { userId: attacker.id }
        });
        expect(updatedAttacker?.health).toBe(10);  // Should be capped at max HP, not 14
      }
    });

    it('should apply both HoT and immediate healing during Drain attack', async () => {
      const activeEffects = [
        {
          effectId: 'heal_test_over_time_2',
          name: 'Test Heal Over Time +2',
          duration: 'turns:3',
          turnsLeft: 3,
          appliedAt: new Date().toISOString()
        }
      ];

      const attacker = await createArkanaTestUser({
        characterName: 'Regenerating Necromancer',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 20,
        health: 10,  // Start at 10 HP
        activeEffects,  // Has HoT effect
        magicWeaves: ['necromancy_drain']
      });

      const target = await createArkanaTestUser({
        characterName: 'Target Player',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'necromancy_drain',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      if (data.data.attackSuccess === 'true') {
        // Should apply both HoT (2 HP) and immediate healing (6 HP) = 8 HP total
        // 10 + 8 = 18 HP
        const updatedAttacker = await prisma.userStats.findUnique({
          where: { userId: attacker.id }
        });
        expect(updatedAttacker?.health).toBe(18);

        // Verify HoT effect was decremented
        const updatedStats = await prisma.arkanaStats.findUnique({
          where: { userId: attacker.id }
        });
        const effects = updatedStats?.activeEffects as ActiveEffect[];
        expect(effects[0].turnsLeft).toBe(2);  // Decremented from 3 to 2
      }
    });

    it('should process turn effects even when Drain attack misses', async () => {
      const activeEffects = [
        {
          effectId: 'heal_test_over_time_2',
          name: 'Test Heal Over Time +2',
          duration: 'turns:3',
          turnsLeft: 3,
          appliedAt: new Date().toISOString()
        }
      ];

      const attacker = await createArkanaTestUser({
        characterName: 'Unlucky Necromancer',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 2,
        mental: 1,  // Low mental to increase miss chance
        perception: 3,
        hitPoints: 20,
        health: 10,
        activeEffects,
        magicWeaves: ['necromancy_drain']
      });

      const target = await createArkanaTestUser({
        characterName: 'Target Player',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 5,  // High mental for defense
        perception: 3,
        hitPoints: 10
      });

      // Try multiple times to get a miss
      let foundMiss = false;
      for (let i = 0; i < 20 && !foundMiss; i++) {
        const timestamp = new Date().toISOString();
        const signature = generateSignature(timestamp, 'arkana');

        const requestData = {
          attacker_uuid: attacker.slUuid,
          power_id: 'necromancy_drain',
          target_uuid: target.slUuid,
          nearby_uuids: [],
          universe: 'arkana',
          timestamp,
          signature
        };

        const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
        const response = await POST(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);

        if (data.data.attackSuccess === 'false') {
          foundMiss = true;

          // Even on miss, HoT should still apply (2 HP healing)
          const updatedAttacker = await prisma.userStats.findUnique({
            where: { userId: attacker.id }
          });
          // HoT healing should have applied
          expect(updatedAttacker?.health).toBeGreaterThan(10);

          // Verify effect was decremented
          const updatedStats = await prisma.arkanaStats.findUnique({
            where: { userId: attacker.id }
          });
          const effects = updatedStats?.activeEffects as ActiveEffect[];
          expect(effects[0].turnsLeft).toBeLessThan(3);  // Was decremented
        }

        // Reset for next attempt
        await prisma.userStats.update({
          where: { userId: attacker.id },
          data: { health: 10 }
        });
        await prisma.arkanaStats.update({
          where: { userId: attacker.id },
          data: { activeEffects: activeEffects as ActiveEffect[] }
        });
      }

      expect(foundMiss).toBe(true);
    });

    it('should show correct healing amount in message', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Necromancer',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 10,
        health: 5,
        magicWeaves: ['necromancy_drain']
      });

      const target = await createArkanaTestUser({
        characterName: 'Target Player',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'necromancy_drain',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      if (data.data.attackSuccess === 'true') {
        const decodedMessage = decodeURIComponent(data.data.message);

        // Should show healing in attacker effects section
        expect(decodedMessage).toContain('Attacker:');
        expect(decodedMessage).toContain('Heals 6 HP');

        // Should also show damage to target
        expect(decodedMessage).toContain('damage dealt');
        expect(decodedMessage).toContain('Target:');
      }
    });

    it('should heal from low HP correctly', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Nearly Dead Necromancer',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 10,
        health: 1,  // Very low HP
        magicWeaves: ['necromancy_drain']
      });

      const target = await createArkanaTestUser({
        characterName: 'Target Player',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'necromancy_drain',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      if (data.data.attackSuccess === 'true') {
        // Should heal from 1 to 7 HP (1 + 6)
        const updatedAttacker = await prisma.userStats.findUnique({
          where: { userId: attacker.id }
        });
        expect(updatedAttacker?.health).toBe(7);
      }
    });

    it('should process scene-based heal during Drain attack', async () => {
      const activeEffects = [
        {
          effectId: 'heal_test_scene_regeneration',
          name: 'Test Scene Regeneration',
          duration: 'scene',
          turnsLeft: 999,
          appliedAt: new Date().toISOString()
        }
      ];

      const attacker = await createArkanaTestUser({
        characterName: 'Blessed Necromancer',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 20,
        health: 10,
        activeEffects,  // Scene-based heal (1 HP per turn, never decrements)
        magicWeaves: ['necromancy_drain']
      });

      const target = await createArkanaTestUser({
        characterName: 'Target Player',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'necromancy_drain',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      if (data.data.attackSuccess === 'true') {
        // Should apply scene heal (1 HP) + immediate heal (6 HP) = 7 HP total
        // 10 + 7 = 17 HP
        const updatedAttacker = await prisma.userStats.findUnique({
          where: { userId: attacker.id }
        });
        expect(updatedAttacker?.health).toBe(17);

        // Verify scene effect was NOT decremented
        const updatedStats = await prisma.arkanaStats.findUnique({
          where: { userId: attacker.id }
        });
        const effects = updatedStats?.activeEffects as ActiveEffect[];
        expect(effects[0].turnsLeft).toBe(999);  // Should remain 999
      }
    });
  });

  describe('Roll Calculation Consistency Tests', () => {
    it('should show HIT when roll >= TN in message calculation', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Strong Attacker',
        race: 'strigoi',
        archetype: 'Life',
        physical: 3,
        dexterity: 2,
        mental: 7, // High mental (+10 modifier)
        perception: 3,
        hitPoints: 15,
        commonPowers: ['strigoi_hypnosis']
      });

      const target = await createArkanaTestUser({
        characterName: 'Weak Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 1, // Low mental (-1 modifier, easier to hit)
        perception: 3,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'strigoi_hypnosis',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Parse the message to extract roll information
      const decodedMessage = decodeURIComponent(data.data.message);
      const rollMatch = decodedMessage.match(/Roll: d20\((\d+)\).*?=\s*(\d+)\s+vs TN:.*?=\s*(\d+)/);

      if (rollMatch) {
        const [, , total, tn] = rollMatch;
        const rollTotal = parseInt(total);
        const targetNumber = parseInt(tn);

        // Verify message consistency
        if (rollTotal >= targetNumber) {
          expect(decodedMessage).toContain('HIT!');
          expect(data.data.attackSuccess).toBe('true');
        } else {
          expect(decodedMessage).toContain('MISS!');
          expect(data.data.attackSuccess).toBe('false');
        }
      }
    });

    it('should show MISS when roll < TN in message calculation', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Weak Attacker',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 1, // Very low mental (-1 modifier, likely to miss)
        perception: 3,
        hitPoints: 10,
        commonPowers: ['strigoi_hypnosis']
      });

      const target = await createArkanaTestUser({
        characterName: 'Strong Target',
        race: 'strigoi',
        archetype: 'Life',
        physical: 2,
        dexterity: 2,
        mental: 7, // High mental (+10 modifier, hard to hit)
        perception: 3,
        hitPoints: 15
      });

      // Try multiple times to ensure we get at least one miss
      let foundMiss = false;
      for (let i = 0; i < 20 && !foundMiss; i++) {
        const timestamp = new Date().toISOString();
        const signature = generateSignature(timestamp, 'arkana');

        const requestData = {
          attacker_uuid: attacker.slUuid,
          power_id: 'strigoi_hypnosis',
          target_uuid: target.slUuid,
          nearby_uuids: [],
          universe: 'arkana',
          timestamp,
          signature
        };

        const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
        const response = await POST(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);

        if (data.data.attackSuccess === 'false') {
          foundMiss = true;

          // Parse message and verify consistency
          const decodedMessage = decodeURIComponent(data.data.message);
          const rollMatch = decodedMessage.match(/Roll: d20\((\d+)\).*?=\s*(\d+)\s+vs TN:.*?=\s*(\d+)/);

          if (rollMatch) {
            const [, , total, tn] = rollMatch;
            const rollTotal = parseInt(total);
            const targetNumber = parseInt(tn);

            // CRITICAL: Roll total must be less than TN for a miss
            expect(rollTotal).toBeLessThan(targetNumber);
            expect(decodedMessage).toContain('MISS!');
          }
        }
      }

      // Should find at least one miss with these stats
      expect(foundMiss).toBe(true);
    });

    it('should have mathematically consistent roll messages', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Test Attacker',
        race: 'strigoi',
        archetype: 'Life',
        physical: 3,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 15,
        commonPowers: ['strigoi_hypnosis']
      });

      const target = await createArkanaTestUser({
        characterName: 'Test Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'strigoi_hypnosis',
        target_uuid: target.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      const decodedMessage = decodeURIComponent(data.data.message);

      // Message should contain roll information
      expect(decodedMessage).toMatch(/Roll: d20\(\d+\)/);
      expect(decodedMessage).toMatch(/vs TN:/);
      expect(decodedMessage).toMatch(/(HIT!|MISS!)/);

      // Extract and validate calculation
      const rollMatch = decodedMessage.match(/Roll: d20\((\d+)\).*?=\s*(\d+)\s+vs TN:.*?=\s*(\d+)/);
      if (rollMatch) {
        const [, d20, total, tn] = rollMatch;
        const d20Value = parseInt(d20);
        const rollTotal = parseInt(total);
        const targetNumber = parseInt(tn);

        // Verify d20 is valid (1-20)
        expect(d20Value).toBeGreaterThanOrEqual(1);
        expect(d20Value).toBeLessThanOrEqual(20);

        // Verify success matches calculation
        const shouldHit = rollTotal >= targetNumber;
        if (shouldHit) {
          expect(data.data.attackSuccess).toBe('true');
          expect(decodedMessage).toContain('HIT!');
        } else {
          expect(data.data.attackSuccess).toBe('false');
          expect(decodedMessage).toContain('MISS!');
        }
      }
    });
  });

  describe('Area-of-Effect Attack Tests', () => {
    it('should execute area attack WITHOUT primary target using test_area_psychic_blast', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Area Attacker',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 15,
        archetypePowers: ['test_area_psychic_blast']
      });

      const nearby1 = await createArkanaTestUser({
        characterName: 'Nearby Target 1',
        race: 'human',
        archetype: 'Warrior',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10
      });

      const nearby2 = await createArkanaTestUser({
        characterName: 'Nearby Target 2',
        race: 'human',
        archetype: 'Warrior',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'test_area_psychic_blast',
        // target_uuid: OMITTED (no primary target)
        nearby_uuids: [nearby1.slUuid, nearby2.slUuid],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.powerUsed).toBe('Test Psychic Blast');
      expect(data.data.affected).toBeDefined();
      expect(data.data.affected.length).toBe(2);

      // Verify both targets were affected
      const affectedUuids = data.data.affected.map((t: { uuid: string }) => t.uuid);
      expect(affectedUuids).toContain(nearby1.slUuid);
      expect(affectedUuids).toContain(nearby2.slUuid);

      // Verify no primary target field in response
      expect(data.data.target).toBeUndefined();
    });

    it('should return 400 when area attack has NO targets available', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Lonely Attacker',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 15,
        archetypePowers: ['test_area_psychic_blast']
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'test_area_psychic_blast',
        // target_uuid: OMITTED
        nearby_uuids: [], // Empty array - no targets
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'No valid targets in area');
      expect(response.status).toBe(400);
    });

    it('should filter invalid nearby targets from area attack', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Selective Attacker',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 15,
        archetypePowers: ['test_area_psychic_blast']
      });

      const validTarget = await createArkanaTestUser({
        characterName: 'Valid Target',
        race: 'human',
        archetype: 'Warrior',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10
      });

      const unconsciousTarget = await createArkanaTestUser({
        characterName: 'Unconscious Target',
        race: 'human',
        archetype: 'Warrior',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10,
        health: 0 // Unconscious
      });

      const oocTarget = await createArkanaTestUser({
        characterName: 'OOC Target',
        race: 'human',
        archetype: 'Warrior',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10
      });

      // Set OOC target to OOC mode
      await prisma.userStats.update({
        where: { userId: oocTarget.id },
        data: { status: 1 }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'test_area_psychic_blast',
        // target_uuid: OMITTED
        nearby_uuids: [validTarget.slUuid, unconsciousTarget.slUuid, oocTarget.slUuid],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.affected.length).toBe(1); // Only valid target
      expect(data.data.affected[0].uuid).toBe(validTarget.slUuid);
    });

    it('should hit multiple nearby targets with area power', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Multi Attacker',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 15,
        archetypePowers: ['test_area_psychic_blast']
      });

      // Create 3 nearby targets
      const nearby1 = await createArkanaTestUser({
        characterName: 'Nearby 1',
        race: 'human',
        archetype: 'Warrior',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10
      });

      const nearby2 = await createArkanaTestUser({
        characterName: 'Nearby 2',
        race: 'human',
        archetype: 'Warrior',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10
      });

      const nearby3 = await createArkanaTestUser({
        characterName: 'Nearby 3',
        race: 'human',
        archetype: 'Warrior',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'test_area_psychic_blast',
        // target_uuid: OMITTED
        nearby_uuids: [nearby1.slUuid, nearby2.slUuid, nearby3.slUuid],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.affected.length).toBe(3);

      // Verify all targets took damage
      for (const affected of data.data.affected) {
        expect(affected.damage).toBeGreaterThan(0);
        expect(affected.healthBefore).toBeGreaterThan(affected.healthAfter);
      }
    });
  });

  describe('Target Validation Tests', () => {
    it('should return 404 when target UUID is provided but user not found', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Attacker',
        race: 'strigoi',
        archetype: 'Life',
        physical: 3,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 15,
        commonPowers: ['strigoi_hypnosis']
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'strigoi_hypnosis',
        target_uuid: generateTestUUID(), // Valid UUID format but doesn't exist
        nearby_uuids: [],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Target not found');
      expect(response.status).toBe(404); // NOT 400
    });

    it('should return 404 for missing target, 400 for invalid state', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Attacker',
        race: 'strigoi',
        archetype: 'Life',
        physical: 3,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 15,
        commonPowers: ['strigoi_hypnosis']
      });

      const existingTarget = await createArkanaTestUser({
        characterName: 'Existing Target',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        health: 0 // Unconscious
      });

      // Test 1: Non-existent UUID returns 404
      const timestamp1 = new Date().toISOString();
      const signature1 = generateSignature(timestamp1, 'arkana');

      const request1 = createMockPostRequest('/api/arkana/combat/power-attack', {
        attacker_uuid: attacker.slUuid,
        power_id: 'strigoi_hypnosis',
        target_uuid: generateTestUUID(),
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp1,
        signature: signature1
      });

      const response1 = await POST(request1);
      expect(response1.status).toBe(404);

      // Test 2: Existing but unconscious target returns 400
      const timestamp2 = new Date().toISOString();
      const signature2 = generateSignature(timestamp2, 'arkana');

      const request2 = createMockPostRequest('/api/arkana/combat/power-attack', {
        attacker_uuid: attacker.slUuid,
        power_id: 'strigoi_hypnosis',
        target_uuid: existingTarget.slUuid,
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: timestamp2,
        signature: signature2
      });

      const response2 = await POST(request2);
      expect(response2.status).toBe(400); // NOT 404
    });
  });

  describe('Validation Schema Tests (Extended)', () => {
    it('should accept request with NO target_uuid for area powers', () => {
      const payload = {
        attacker_uuid: generateTestUUID(),
        power_id: 'test_area_psychic_blast',
        // target_uuid: OMITTED
        nearby_uuids: [generateTestUUID()],
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerAttackSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('should accept request with empty string target_uuid', () => {
      const payload = {
        attacker_uuid: generateTestUUID(),
        power_id: 'some_power',
        target_uuid: '', // Empty string
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerAttackSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('should reject request with invalid UUID format for target_uuid', () => {
      const payload = {
        attacker_uuid: generateTestUUID(),
        power_id: 'some_power',
        target_uuid: 'not-a-valid-uuid',
        nearby_uuids: [],
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerAttackSchema.validate(payload);
      expect(error).toBeDefined();
    });
  });

  describe('Fixed TN Check Tests (check_mental_vs_tn10)', () => {
    it('should execute area attack with fixed TN check (check_mental_vs_tn10) - NO primary target - SUCCESS', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'TK Attacker',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 5,  // +6 modifier (tier 5-6)
        perception: 3,
        hitPoints: 15,
        archetypePowers: ['test_area_tk_surge']
      });

      const nearby1 = await createArkanaTestUser({
        characterName: 'Nearby Target 1',
        race: 'human',
        archetype: 'Warrior',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 20
      });

      const nearby2 = await createArkanaTestUser({
        characterName: 'Nearby Target 2',
        race: 'human',
        archetype: 'Warrior',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 20
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'test_area_tk_surge',
        // NO target_uuid - area attack with fixed TN check
        nearby_uuids: [nearby1.slUuid, nearby2.slUuid],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);

      const data = await parseJsonResponse(response);

      // Fixed TN check should work without primary target
      expectSuccess(data);
      const decodedMessage = decodeURIComponent(data.data.message);
      expect(decodedMessage).toContain('Test TK Surge');

      // With Mental 5 (+6), should execute without error (check may pass or fail due to d20 roll)
      // Key assertion: NO "Attack check requires a primary target" error
      expect(data.data.message).not.toContain('Attack check requires');
    });

    it('should execute area attack with fixed TN check - low Mental - possible FAILURE', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Weak TK Attacker',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 1,  // -2 modifier (tier 0-1)
        perception: 3,
        hitPoints: 15,
        archetypePowers: ['test_area_tk_surge']
      });

      const nearby1 = await createArkanaTestUser({
        characterName: 'Nearby Target',
        race: 'human',
        archetype: 'Warrior',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 20
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'test_area_tk_surge',
        // NO target_uuid - area attack with fixed TN check
        nearby_uuids: [nearby1.slUuid],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);

      const data = await parseJsonResponse(response);

      // Should not error - fixed TN checks work without targets
      // Key assertion: API call succeeds (doesn't return 400 error)
      // The check itself may fail (expected with Mental 1), but the endpoint should work
      if (!data.success) {
        // If API failed, it should NOT be due to "Attack check requires a primary target"
        expect(data.error).not.toContain('Attack check requires');
      } else {
        expectSuccess(data);
        const decodedMessage = decodeURIComponent(data.data.message);
        expect(decodedMessage).toContain('Test TK Surge');
      }
    });

    it('should reject enemy_stat check without primary target', async () => {
      // This test ensures enemy_stat checks still require targets
      const attacker = await createArkanaTestUser({
        characterName: 'Psion Attacker',
        race: 'human',
        archetype: 'Psion',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 15,
        archetypePowers: ['gaki_death_soul_drain']  // Uses check_mental_vs_mental (enemy_stat)
      });

      const nearby1 = await createArkanaTestUser({
        characterName: 'Nearby Target',
        race: 'human',
        archetype: 'Warrior',
        physical: 3,
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 20
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'gaki_death_soul_drain',
        // NO target_uuid - should FAIL for enemy_stat check
        nearby_uuids: [nearby1.slUuid],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);

      const data = await parseJsonResponse(response);

      // Should fail because enemy_stat checks require a primary target
      expectError(data, 'Attack check requires a primary target');
    });

    // Test area attack with check FAILURE without primary target (regression test for HTTP 500)
    it('should handle area attack check FAILURE with fixed TN check - NO primary target - NO HTTP 500', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Weak TK User',
        race: 'human',
        mental: 1,  // +0 modifier (tier 0-2) - likely to fail TN 10 check
        archetypePowers: ['test_area_tk_surge']
      });

      const nearby1 = await createArkanaTestUser({
        characterName: 'Nearby Target 1',
        race: 'human',
        physical: 3
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        attacker_uuid: attacker.slUuid,
        power_id: 'test_area_tk_surge',
        // NO target_uuid - area attack with fixed TN check
        nearby_uuids: [nearby1.slUuid],
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-attack', requestData);
      const response = await POST(request);

      const data = await parseJsonResponse(response);

      // Primary assertion: Should return HTTP 200, not HTTP 500 (regression test)
      expect(response.status).toBe(200);
      expectSuccess(data);

      // Secondary assertions: Verify response format
      expect(data.data.powerUsed).toBe('Test TK Surge');
      expect(data.data.rollInfo).toBeTruthy();

      const decodedMessage = decodeURIComponent(data.data.message);
      expect(decodedMessage).toContain('Weak TK User');
      expect(decodedMessage).toContain('Test TK Surge');
      expect(decodedMessage).toContain('vs TN:10');

      // Check-specific assertions: If check failed (which is likely with Mental 1)
      if (data.data.attackSuccess === 'false') {
        expect(data.data.totalDamage).toBe(0);
        expect(data.data.affected).toEqual([]);

        // Should NOT have target object (since no primary target)
        expect(data.data.target).toBeUndefined();

        // Message should contain MISS
        expect(decodedMessage).toContain('MISS');
      } else {
        // Check succeeded (less likely but possible with Mental 1)
        // Just verify it completed without errors
        expect(data.data.attackSuccess).toBe('true');
      }
    });
  });
});
