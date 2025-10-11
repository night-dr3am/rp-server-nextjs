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
