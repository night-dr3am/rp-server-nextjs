import { POST } from '../route';
import { arkanaUserPowersSchema } from '@/lib/validation';
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

// Type for power response (memory-optimized: only id and name)
interface PowerResponse {
  id: string;
  name: string;
}

describe('/api/arkana/combat/user-powers', () => {
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
    commonPowers?: string[];
    archetypePowers?: string[];
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
    it('should return attack powers from user common powers', async () => {
      // Create player with common powers that include attack abilities
      const player = await createArkanaTestUser({
        characterName: 'Powerful Strigoi',
        race: 'strigoi',
        archetype: 'Life',
        physical: 3,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 15,
        commonPowers: ['strigoi_hypnosis', 'strigoi_wall_walking', 'strigoi_shapeshifting'],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/user-powers', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.powers).toBeDefined();
      expect(Array.isArray(data.data.powers)).toBe(true);

      // hypnosis is an attack power, shapeshifting and wall_walking are not
      expect(data.data.powers.length).toBeGreaterThan(0);
      const hypnosisPower = data.data.powers.find((p: PowerResponse) => p.id === 'strigoi_hypnosis');
      expect(hypnosisPower).toBeDefined();
      expect(hypnosisPower.name).toBeDefined();
      // Details (baseStat, targetType, range) fetched via power-info endpoint
    });

    it('should return attack powers from user archetype powers', async () => {
      // Create player with archetype powers
      const player = await createArkanaTestUser({
        characterName: 'Strigoi Warrior',
        race: 'strigoi',
        archetype: 'Life',
        physical: 4,
        dexterity: 2,
        mental: 3,
        perception: 2,
        hitPoints: 20,
        commonPowers: [],
        archetypePowers: ['strigoi_life_cradle_of_hunger', 'strigoi_life_blood_seed']
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/user-powers', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.powers).toBeDefined();
      expect(Array.isArray(data.data.powers)).toBe(true);
      expect(data.data.powers.length).toBeGreaterThan(0);

      // Both archetype powers are attack powers
      const cradlePower = data.data.powers.find((p: PowerResponse) => p.id === 'strigoi_life_cradle_of_hunger');
      expect(cradlePower).toBeDefined();
      expect(cradlePower.name).toBeDefined();
    });

    it('should return empty list for user with no attack powers', async () => {
      // Create player with only non-attack powers
      const player = await createArkanaTestUser({
        characterName: 'Utility Character',
        race: 'strigoi',
        archetype: 'Life',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 3,
        hitPoints: 10,
        commonPowers: ['strigoi_wall_walking'], // passive power
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/user-powers', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.powers).toBeDefined();
      expect(Array.isArray(data.data.powers)).toBe(true);
      expect(data.data.powers.length).toBe(0); // No attack powers
    });

    it('should return 404 for non-existent player', async () => {
      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: generateTestUUID(), // Non-existent UUID
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/user-powers', requestData);
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
          archetype: 'Arcanist',
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

      const requestData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/user-powers', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Player registration incomplete');
      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid signature', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Test Player',
        race: 'strigoi',
        archetype: 'Life',
        physical: 3,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 15
      });

      const requestData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'invalid-signature'
      };

      const request = createMockPostRequest('/api/arkana/combat/user-powers', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(400); // Validation error
    });

    it('should filter out non-attack powers correctly', async () => {
      // Create player with mixed powers (attack and non-attack)
      const player = await createArkanaTestUser({
        characterName: 'Mixed Powers',
        race: 'strigoi',
        archetype: 'Life',
        physical: 3,
        dexterity: 3,
        mental: 4,
        perception: 3,
        hitPoints: 15,
        commonPowers: [
          'strigoi_hypnosis', // attack
          'strigoi_wall_walking', // passive
          'strigoi_shapeshifting', // ability
          'strigoi_dreamwalking' // attack
        ],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/user-powers', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.powers).toBeDefined();

      // Should only return attack powers
      const powerIds = data.data.powers.map((p: PowerResponse) => p.id);
      expect(powerIds).toContain('strigoi_hypnosis');
      expect(powerIds).toContain('strigoi_dreamwalking');
      expect(powerIds).not.toContain('strigoi_wall_walking'); // passive
      expect(powerIds).not.toContain('strigoi_shapeshifting'); // ability (unless it also has attack)
    });
  });

  describe('Validation Schema Tests', () => {
    it('should accept valid user powers request data', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64) // Valid 64-char hex signature
      };

      const { error } = arkanaUserPowersSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('should reject missing player_uuid', () => {
      const payload = {
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaUserPowersSchema.validate(payload);
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

      const { error } = arkanaUserPowersSchema.validate(payload);
      expect(error).toBeDefined();
    });

    it('should reject non-arkana universe', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        universe: 'gor',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaUserPowersSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('must be [arkana]');
    });

    it('should reject missing universe', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaUserPowersSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('universe');
    });

    it('should reject missing timestamp', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        universe: 'arkana',
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaUserPowersSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('timestamp');
    });

    it('should reject missing signature', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        universe: 'arkana',
        timestamp: new Date().toISOString()
      };

      const { error } = arkanaUserPowersSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('signature');
    });

    it('should require all fields', () => {
      const payload = {
        player_uuid: generateTestUUID()
        // Missing universe, timestamp, signature
      };

      const { error } = arkanaUserPowersSchema.validate(payload);
      expect(error).toBeDefined();
    });
  });
});
