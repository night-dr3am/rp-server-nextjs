import { POST } from '../route';
import { arkanaDeactivateActiveEffectSchema } from '@/lib/validation';
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
import { recalculateLiveStats } from '@/lib/arkana/effectsUtils';
import type { ActiveEffect, ArkanaStats } from '@/lib/arkana/types';

describe('/api/arkana/combat/deactivate-active-effect', () => {
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
    maxHP: number;
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

    const liveStats = arkanaStatsData.activeEffects
      ? recalculateLiveStats({
          physical: arkanaStatsData.physical,
          dexterity: arkanaStatsData.dexterity,
          mental: arkanaStatsData.mental,
          perception: arkanaStatsData.perception,
          maxHP: arkanaStatsData.hitPoints,
        } as ArkanaStats, arkanaStatsData.activeEffects)
      : {};

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
        maxHP: arkanaStatsData.hitPoints,
        activeEffects: arkanaStatsData.activeEffects || [],
        liveStats: liveStats
      }
    });

    return user;
  }

  describe('API Endpoint Tests', () => {
    it('should successfully deactivate scene-based, self-cast effect', async () => {
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
        maxHP: 15,
        activeEffects
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        effect_id: 'effect_test_scene_buff',
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/deactivate-active-effect', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectDeactivated).toBeDefined();
      expect(data.data.effectsRemaining).toBe(0);
      expect(data.data.message).toBeDefined();

      // Verify effect was removed from database
      const updatedPlayer = await prisma.arkanaStats.findUnique({
        where: { userId: player.id }
      });
      expect(updatedPlayer?.activeEffects).toHaveLength(0);
    });

    it('should recalculate liveStats correctly after deactivation', async () => {
      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'effect_mental_boost',
          name: 'Mental Boost',
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
        maxHP: 15,
        activeEffects
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        effect_id: 'effect_mental_boost',
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/deactivate-active-effect', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify liveStats was recalculated
      const updatedPlayer = await prisma.arkanaStats.findUnique({
        where: { userId: player.id }
      });
      expect(updatedPlayer?.liveStats).toBeDefined();
    });

    it('should process turn and decrement other turn-based effects', async () => {
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
        maxHP: 15,
        activeEffects
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        effect_id: 'effect_test_scene_buff',
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/deactivate-active-effect', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsRemaining).toBe(1); // Turn-based effect should remain

      // Verify turn-based effect was decremented
      const updatedPlayer = await prisma.arkanaStats.findUnique({
        where: { userId: player.id }
      });
      const remainingEffects = updatedPlayer?.activeEffects as ActiveEffect[];
      expect(remainingEffects).toHaveLength(1);
      expect(remainingEffects[0].turnsLeft).toBe(2); // Decremented from 3 to 2
    });

    it('should return 403 for trying to deactivate effect cast by another player', async () => {
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
        maxHP: 15,
        activeEffects
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        effect_id: 'effect_test_scene_buff',
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/deactivate-active-effect', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Cannot deactivate effects cast by others');
      expect(response.status).toBe(403);
    });

    it('should return 400 for trying to deactivate turn-based effect', async () => {
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
        maxHP: 15,
        activeEffects
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        effect_id: 'effect_test_turn_buff',
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/deactivate-active-effect', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Cannot deactivate turn-based effects');
      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent player', async () => {
      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: generateTestUUID(),
        effect_id: 'effect_test_scene_buff',
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/deactivate-active-effect', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Player not found in Arkana universe');
      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent effect', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Test Character',
        race: 'human',
        archetype: 'Life',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        maxHP: 15,
        activeEffects: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        effect_id: 'nonexistent_effect',
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/deactivate-active-effect', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Effect not found in active effects');
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
          maxHP: 15
        }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: user.slUuid,
        effect_id: 'effect_test_scene_buff',
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/deactivate-active-effect', requestData);
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
        maxHP: 15
      });

      const timestamp = new Date().toISOString();
      const invalidSignature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      const requestData = {
        player_uuid: player.slUuid,
        effect_id: 'effect_test_scene_buff',
        universe: 'arkana',
        timestamp,
        signature: invalidSignature
      };

      const request = createMockPostRequest('/api/arkana/combat/deactivate-active-effect', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(false);
      expect(response.status).toBe(401);
    });

    it('should return proper effect counts in response', async () => {
      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'effect_test_scene_buff_1',
          name: 'Test Scene Buff 1',
          duration: 'scene',
          turnsLeft: 999,
          appliedAt: new Date().toISOString(),
          casterName: 'Test Character'
        },
        {
          effectId: 'effect_test_scene_buff_2',
          name: 'Test Scene Buff 2',
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
        maxHP: 15,
        activeEffects
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        effect_id: 'effect_test_scene_buff_1',
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/deactivate-active-effect', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsRemaining).toBe(1); // One effect should remain
    });
  });

  describe('Validation Schema Tests', () => {
    it('should accept valid request', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        effect_id: 'test_effect',
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaDeactivateActiveEffectSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('should reject non-arkana universe', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        effect_id: 'test_effect',
        universe: 'gor',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaDeactivateActiveEffectSchema.validate(payload);
      expect(error).toBeDefined();
    });

    it('should reject missing effect_id', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaDeactivateActiveEffectSchema.validate(payload);
      expect(error).toBeDefined();
    });

    it('should reject empty effect_id', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        effect_id: '',
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaDeactivateActiveEffectSchema.validate(payload);
      expect(error).toBeDefined();
    });
  });
});
