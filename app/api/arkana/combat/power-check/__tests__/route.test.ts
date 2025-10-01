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
      expect(data.data.mentalMod).toBe(2); // mental 5 - 3 = +2
      expect(data.data.mentalStat).toBe(5);
      expect(data.data.targetNumber).toBe(12); // Always 12 for power checks
      expect(data.data.d20Roll).toBeGreaterThanOrEqual(1);
      expect(data.data.d20Roll).toBeLessThanOrEqual(20);
      expect(data.data.totalRoll).toBe(data.data.d20Roll + 2);
      expect(data.data.message).toContain('Powerful Psion');
      expect(data.data.player.name).toBe('Powerful Psion');
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
      expect(data.data.mentalMod).toBe(0); // mental 3 - 3 = 0
      expect(data.data.mentalStat).toBe(3);
      expect(data.data.targetNumber).toBe(12);
      expect(data.data.totalRoll).toBe(data.data.d20Roll); // No modifier
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
