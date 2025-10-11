import { POST } from '../route';
import { arkanaPowerInfoSchema } from '@/lib/validation';
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

describe('/api/arkana/combat/power-info', () => {
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
    it('should return power info by power_id', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Strigoi Fighter',
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
        player_uuid: player.slUuid,
        power_id: 'strigoi_hypnosis',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-info', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.id).toBe('strigoi_hypnosis');
      expect(data.data.name).toBeDefined();
      expect(data.data.description).toBeDefined();
      expect(data.data.targetType).toBeDefined();
      expect(data.data.baseStat).toBeDefined();
      expect(data.data.range).toBeDefined();
      expect(data.data.effects).toBeDefined();
    });

    it('should return power info by power_name', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Strigoi Fighter',
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
        player_uuid: player.slUuid,
        power_name: 'Hypnosis',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-info', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.id).toBe('strigoi_hypnosis');
      expect(data.data.name).toBeDefined();
    });

    it('should return 403 when player does not own the power', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Strigoi Fighter',
        race: 'strigoi',
        archetype: 'Life',
        physical: 3,
        dexterity: 2,
        mental: 5,
        perception: 3,
        hitPoints: 15,
        commonPowers: [], // No powers
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        power_id: 'strigoi_hypnosis',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-info', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Player does not own this power');
      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent power', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Strigoi Fighter',
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
        player_uuid: player.slUuid,
        power_id: 'nonexistent_power',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-info', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Power not found');
      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent player', async () => {
      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: generateTestUUID(),
        power_id: 'strigoi_hypnosis',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-info', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Player not found in Arkana universe');
      expect(response.status).toBe(404);
    });
  });

  describe('Validation Schema Tests', () => {
    it('should accept valid request with power_id', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        power_id: 'some_power',
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerInfoSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('should accept valid request with power_name', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        power_name: 'Hypnosis',
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerInfoSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('should reject request without power_id or power_name', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerInfoSchema.validate(payload);
      expect(error).toBeDefined();
      // The error message can vary, just check it exists
      expect(error?.message).toBeDefined();
    });

    it('should reject non-arkana universe', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        power_id: 'some_power',
        universe: 'gor',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerInfoSchema.validate(payload);
      expect(error).toBeDefined();
    });
  });
});
