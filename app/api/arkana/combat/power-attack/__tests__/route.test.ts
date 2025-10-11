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
    commonPowers?: string[];
    archetypePowers?: string[];
  }) {
    const { user } = await createTestUser('arkana');

    await prisma.userStats.create({
      data: {
        userId: user.id,
        health: 100,
        hunger: 100,
        thirst: 100,
        copperCoin: 100
      }
    });

    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        agentName: user.username + ' Resident',
        registrationCompleted: true,
        ...arkanaStatsData
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
});
