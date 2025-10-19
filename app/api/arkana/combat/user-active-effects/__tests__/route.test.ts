import { POST } from '../route';
import { arkanaUserActiveEffectsSchema } from '@/lib/validation';
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

describe('/api/arkana/combat/user-active-effects', () => {
  beforeAll(async () => {
    await setupTestDatabase();
    // Load effect definitions for test mode
    const { loadAllData } = await import('@/lib/arkana/dataLoader');
    await loadAllData();
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
    activeEffects?: ActiveEffect[];
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

    // Don't call recalculateLiveStats for test effects (they don't have definitions)
    // Just use empty liveStats for testing
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
        activeEffects: arkanaStatsData.activeEffects || [],
        liveStats: {}
      }
    });

    return user;
  }

  describe('API Endpoint Tests', () => {
    it('should return scene-based, self-cast effects only', async () => {
      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'effect_test_scene_buff',
          name: 'Test Scene Buff',
          duration: 'scene',
          turnsLeft: 999,
          appliedAt: new Date().toISOString(),
          casterName: 'Test Character'
        },
        {
          effectId: 'effect_test_turn_buff',
          name: 'Test Turn Buff',
          duration: 'turns:3',
          turnsLeft: 3,
          appliedAt: new Date().toISOString(),
          casterName: 'Test Character'
        }
      ];

      const player = await createArkanaTestUser({
        characterName: 'Test Character',
        race: 'human',
        archetype: 'Life',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 15,
        activeEffects
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/user-active-effects', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effects).toHaveLength(1);
      expect(data.data.effects[0].id).toBe('effect_test_scene_buff');
      expect(data.data.effects[0].name).toBeDefined();
    });

    it('should exclude turn-based effects', async () => {
      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'effect_test_turn_buff',
          name: 'Test Turn Buff',
          duration: 'turns:2',
          turnsLeft: 2,
          appliedAt: new Date().toISOString(),
          casterName: 'Test Character'
        }
      ];

      const player = await createArkanaTestUser({
        characterName: 'Test Character',
        race: 'human',
        archetype: 'Life',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 15,
        activeEffects
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/user-active-effects', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effects).toHaveLength(0);
    });

    it('should exclude effects cast by other players', async () => {
      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'effect_test_scene_buff',
          name: 'Test Scene Buff',
          duration: 'scene',
          turnsLeft: 999,
          appliedAt: new Date().toISOString(),
          casterName: 'Other Player'
        }
      ];

      const player = await createArkanaTestUser({
        characterName: 'Test Character',
        race: 'human',
        archetype: 'Life',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 15,
        activeEffects
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/user-active-effects', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effects).toHaveLength(0);
    });

    it('should return empty array when no deactivatable effects', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Test Character',
        race: 'human',
        archetype: 'Life',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 15,
        activeEffects: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/user-active-effects', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effects).toHaveLength(0);
    });

    it('should return 404 for non-existent player', async () => {
      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: generateTestUUID(),
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/user-active-effects', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Player not found in Arkana universe');
      expect(response.status).toBe(404);
    });

    it('should return 400 for player not in RP mode', async () => {
      const { user } = await createTestUser('arkana');

      // Create stats with status = 1 (OOC)
      await prisma.userStats.create({
        data: {
          userId: user.id,
          health: 100,
          hunger: 100,
          thirst: 100,
          copperCoin: 100,
          status: 1  // OOC mode
        }
      });

      await prisma.arkanaStats.create({
        data: {
          userId: user.id,
          agentName: user.username + ' Resident',
          registrationCompleted: true,
          characterName: 'Test Character',
          race: 'human',
          archetype: 'Life',
          physical: 3,
          dexterity: 3,
          mental: 3,
          perception: 3,
          hitPoints: 15
        }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: user.slUuid,
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/user-active-effects', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Player is not in RP mode');
      expect(response.status).toBe(400);
    });

    it('should return 401 for invalid signature', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Test Character',
        race: 'human',
        archetype: 'Life',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 15
      });

      const timestamp = new Date().toISOString();
      const invalidSignature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      const requestData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp,
        signature: invalidSignature
      };

      const request = createMockPostRequest('/api/arkana/combat/user-active-effects', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(false);
      expect(response.status).toBe(401);
    });

    it('should return memory-optimized format with id and name only', async () => {
      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'effect_test_scene_buff',
          name: 'Test Scene Buff',
          duration: 'scene',
          turnsLeft: 999,
          appliedAt: new Date().toISOString(),
          casterName: 'Test Character'
        }
      ];

      const player = await createArkanaTestUser({
        characterName: 'Test Character',
        race: 'human',
        archetype: 'Life',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 15,
        activeEffects
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/user-active-effects', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effects).toHaveLength(1);

      const effect = data.data.effects[0];
      expect(effect).toHaveProperty('id');
      expect(effect).toHaveProperty('name');
      expect(Object.keys(effect)).toHaveLength(2); // Only id and name
    });
  });

  describe('Validation Schema Tests', () => {
    it('should accept valid request', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaUserActiveEffectsSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('should reject non-arkana universe', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        universe: 'gor',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaUserActiveEffectsSchema.validate(payload);
      expect(error).toBeDefined();
    });

    it('should reject missing player_uuid', () => {
      const payload = {
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaUserActiveEffectsSchema.validate(payload);
      expect(error).toBeDefined();
    });
  });
});
