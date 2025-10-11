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

  // Helper function to create a complete Arkana test user
  async function createArkanaTestUser(arkanaStatsData: {
    characterName: string;
    race: string;
    archetype: string;
    physical: number;
    dexterity: number;
    mental: number;
    perception: number;
    hitPoints: number;
  }) {
    const { user } = await createTestUser('arkana');

    // Create userStats
    await prisma.userStats.create({
      data: {
        userId: user.id,
        health: 100,
        hunger: 100,
        thirst: 100,
        copperCoin: 100
      }
    });

    // Create arkanaStats
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
    it('should process a physical attack correctly', async () => {
      // Create attacker with high physical stat
      const attacker = await createArkanaTestUser({
        characterName: 'Strong Warrior',
        race: 'human',
        archetype: 'Fighter',
        physical: 5, // High physical = +2 modifier
        dexterity: 2,
        mental: 2,
        perception: 2,
        hitPoints: 25
      });

      // Create target with low dexterity
      const target = await createArkanaTestUser({
        characterName: 'Slow Target',
        race: 'human',
        archetype: 'Scholar',
        physical: 2,
        dexterity: 1, // Low dex = -2 modifier (TN = 10 + (-2) = 8)
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
      expect(data.data.attackStat).toBe('Physical');
      expect(data.data.defenseStat).toBe('Dexterity');
      expect(data.data.attackerMod).toBe(6); // physical 5 → +6 (from calculateStatModifier)
      expect(data.data.defenderMod).toBe(-2); // dexterity 1 → -2 (from calculateStatModifier)
      expect(data.data.targetNumber).toBe(8); // 10 + (-2) = 8
      expect(data.data.d20Roll).toBeGreaterThanOrEqual(1);
      expect(data.data.d20Roll).toBeLessThanOrEqual(20);
      expect(data.data.attackRoll).toBe(data.data.d20Roll + 6); // d20 + attacker mod (+6)
      expect(data.data.message).toContain('Strong%20Warrior');
      expect(data.data.message).toContain('Slow%20Target');
      expect(data.data.attacker.name).toBe('Strong%20Warrior');
      expect(data.data.target.name).toBe('Slow%20Target');
    });

    it('should process a ranged attack correctly', async () => {
      const attacker = await createArkanaTestUser({
        characterName: 'Archer',
        race: 'human',
        archetype: 'Ranger',
        physical: 2,
        dexterity: 4, // Good dex for ranged
        mental: 3,
        perception: 4,
        hitPoints: 10
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Mage',
        physical: 2,
        dexterity: 3,
        mental: 4,
        perception: 2,
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
      expect(data.data.attackStat).toBe('Dexterity');
      expect(data.data.defenseStat).toBe('Dexterity');
      expect(data.data.attackerMod).toBe(4); // dexterity 4 → +4 (from calculateStatModifier)
      expect(data.data.defenderMod).toBe(2); // dexterity 3 → +2 (from calculateStatModifier)
      expect(data.data.targetNumber).toBe(12); // 10 + 2 = 12
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
});