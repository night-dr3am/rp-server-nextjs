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
import type { ActiveEffect } from '@/lib/arkana/types';

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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { health: _, ...arkanaDataWithoutHealth } = arkanaStatsData;

    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        agentName: user.username + ' Resident',
        registrationCompleted: true,
        ...arkanaDataWithoutHealth
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

      expectError(data, 'Target player is not in RP mode');
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
});
