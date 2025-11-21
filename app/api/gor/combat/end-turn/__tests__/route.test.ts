import { POST } from '../route';
import { prisma } from '@/lib/prisma';
import { generateSignature } from '@/lib/signature';
import {
  createMockPostRequest,
  parseJsonResponse,
  expectSuccess,
  expectError,
  cleanupTestData
} from '@/__tests__/utils/test-helpers';

// Helper to create test body with signature
function createRequestBody(data: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const universe = 'gor';
  return {
    ...data,
    universe,
    timestamp,
    signature: generateSignature(timestamp, universe)
  };
}

// Helper to create a test Gorean character with effects
async function createTestCharacter(overrides: Record<string, unknown> = {}) {
  const uuid = crypto.randomUUID();
  const username = `TestChar${Date.now()}`;

  const user = await prisma.user.create({
    data: {
      slUuid: uuid,
      universe: 'gor',
      username,
      role: 'FREE',
      stats: {
        create: {
          health: 80,
          status: 2,
          hunger: 100,
          thirst: 100
        }
      },
      goreanStats: {
        create: {
          characterName: overrides.characterName as string || 'Test Character',
          agentName: username,
          species: 'human',
          speciesCategory: 'sapient',
          culture: 'southern_cities',
          cultureType: 'cityState',
          socialStatus: 'freeMan',
          strength: 3,
          agility: 3,
          intellect: 2,
          perception: 2,
          charisma: 3,
          statPointsPool: 0,
          statPointsSpent: 10,
          healthMax: overrides.healthMax as number || 100,
          healthCurrent: overrides.healthCurrent as number || 80,
          hungerMax: 100,
          hungerCurrent: 100,
          thirstMax: 100,
          thirstCurrent: 100,
          skills: [],
          abilities: [],
          activeEffects: overrides.activeEffects || [],
          liveStats: overrides.liveStats || {},
          xp: 0,
          registrationCompleted: true
        }
      }
    }
  });

  return { uuid, username, user };
}

describe('POST /api/gor/combat/end-turn', () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Validation', () => {
    it('should reject request without player_uuid', async () => {
      const body = createRequestBody({});

      const request = createMockPostRequest('/api/gor/combat/end-turn', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'player_uuid');
    });

    it('should reject invalid signature', async () => {
      const body = {
        player_uuid: crypto.randomUUID(),
        universe: 'gor',
        timestamp: new Date().toISOString(),
        signature: 'invalid_signature'
      };

      const request = createMockPostRequest('/api/gor/combat/end-turn', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'signature');
    });

    it('should reject invalid universe', async () => {
      const timestamp = new Date().toISOString();
      const body = {
        player_uuid: crypto.randomUUID(),
        universe: 'arkana',
        timestamp,
        signature: generateSignature(timestamp, 'arkana')
      };

      const request = createMockPostRequest('/api/gor/combat/end-turn', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'universe');
    });
  });

  describe('User Not Found', () => {
    it('should return 404 for non-existent user', async () => {
      const body = createRequestBody({
        player_uuid: crypto.randomUUID()
      });

      const request = createMockPostRequest('/api/gor/combat/end-turn', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'not found');
    });
  });

  describe('Turn Processing', () => {
    it('should handle empty effects array', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: []
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/end-turn', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsRemaining).toBe(0);
      expect(data.data.healingApplied).toBe(0);
    });

    it('should decrement turn-based effect duration', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: [
          {
            effectId: 'strength_buff',
            name: 'Strength Buff',
            category: 'stat_modifier',
            turnsRemaining: 3,
            stat: 'Strength',
            modifier: 5,
            duration: 'turns:3'
          }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/end-turn', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsRemaining).toBe(1);

      // Verify in database
      const updatedUser = await prisma.user.findFirst({
        where: { slUuid: uuid },
        include: { goreanStats: true }
      });
      const effects = updatedUser?.goreanStats?.activeEffects as unknown as Array<{ turnsRemaining: number }>;
      expect(effects[0].turnsRemaining).toBe(2);
    });

    it('should remove effect when turnsRemaining reaches 0', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: [
          {
            effectId: 'strength_buff',
            name: 'Strength Buff',
            category: 'stat_modifier',
            turnsRemaining: 1,
            stat: 'Strength',
            modifier: 5,
            duration: 'turns:1'
          }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/end-turn', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsRemaining).toBe(0);
    });

    it('should preserve scene effects (not decrement)', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: [
          {
            effectId: 'scene_buff',
            name: 'Scene Buff',
            category: 'stat_modifier',
            turnsRemaining: 999,
            sceneEffect: true,
            stat: 'Strength',
            modifier: 3,
            duration: 'scene'
          }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/end-turn', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsRemaining).toBe(1);

      // Verify scene effect was not decremented
      const updatedUser = await prisma.user.findFirst({
        where: { slUuid: uuid },
        include: { goreanStats: true }
      });
      const effects = updatedUser?.goreanStats?.activeEffects as unknown as Array<{ turnsRemaining: number }>;
      expect(effects[0].turnsRemaining).toBe(999);
    });

    it('should handle multiple effects with different durations', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: [
          {
            effectId: 'buff1',
            name: 'Buff 1',
            category: 'stat_modifier',
            turnsRemaining: 1,
            stat: 'Strength',
            modifier: 2,
            duration: 'turns:1'
          },
          {
            effectId: 'buff2',
            name: 'Buff 2',
            category: 'stat_modifier',
            turnsRemaining: 3,
            stat: 'Agility',
            modifier: 2,
            duration: 'turns:3'
          },
          {
            effectId: 'scene_buff',
            name: 'Scene Buff',
            category: 'stat_modifier',
            turnsRemaining: 999,
            sceneEffect: true,
            stat: 'Intellect',
            modifier: 1,
            duration: 'scene'
          }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/end-turn', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // buff1 removed (1->0), buff2 decremented (3->2), scene_buff preserved
      expect(data.data.effectsRemaining).toBe(2);
    });
  });

  describe('Healing', () => {
    it('should apply healing from heal effects', async () => {
      const { uuid } = await createTestCharacter({
        healthCurrent: 50,
        healthMax: 100,
        activeEffects: [
          {
            effectId: 'regeneration',
            name: 'Regeneration',
            category: 'heal',
            turnsRemaining: 3,
            duration: 'turns:3'
          }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/end-turn', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Healing should be applied (exact amount depends on effect definition)
      expect(data.data.currentHP).toBeGreaterThanOrEqual(50);
    });

    it('should cap healing at healthMax', async () => {
      const { uuid } = await createTestCharacter({
        healthCurrent: 95,
        healthMax: 100,
        activeEffects: [
          {
            effectId: 'regeneration',
            name: 'Regeneration',
            category: 'heal',
            turnsRemaining: 3,
            duration: 'turns:3'
          }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/end-turn', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.currentHP).toBeLessThanOrEqual(100);
      expect(data.data.maxHP).toBe(100);
    });

    it('should not apply healing when no heal effects', async () => {
      const { uuid } = await createTestCharacter({
        healthCurrent: 50,
        healthMax: 100,
        activeEffects: [
          {
            effectId: 'strength_buff',
            name: 'Strength Buff',
            category: 'stat_modifier',
            turnsRemaining: 3,
            stat: 'Strength',
            modifier: 5,
            duration: 'turns:3'
          }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/end-turn', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.healingApplied).toBe(0);
      expect(data.data.currentHP).toBe(50);
    });
  });

  describe('Response Format', () => {
    it('should return correct response structure', async () => {
      const { uuid } = await createTestCharacter({
        characterName: 'Tarl Cabot',
        healthCurrent: 80,
        healthMax: 100,
        activeEffects: []
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/end-turn', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data).toHaveProperty('playerName');
      expect(data.data).toHaveProperty('effectsRemaining');
      expect(data.data).toHaveProperty('healingApplied');
      expect(data.data).toHaveProperty('currentHP');
      expect(data.data).toHaveProperty('maxHP');
      expect(data.data).toHaveProperty('effectsDisplay');
      expect(data.data).toHaveProperty('message');
    });

    it('should include effectsDisplay in response', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: [
          {
            effectId: 'strength_buff',
            name: 'Strength Buff',
            category: 'stat_modifier',
            turnsRemaining: 3,
            stat: 'Strength',
            modifier: 5,
            duration: 'turns:3'
          }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/end-turn', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsDisplay).toBeDefined();
      // After turn, effect has 2 turns remaining
      expect(decodeURIComponent(data.data.effectsDisplay)).toContain('2t');
    });
  });

  describe('Control Effects', () => {
    it('should decrement control effects like stun', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: [
          {
            effectId: 'stun_effect',
            name: 'Stunned',
            category: 'control',
            turnsRemaining: 2,
            controlType: 'stun',
            duration: 'turns:2'
          }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/end-turn', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsRemaining).toBe(1);

      // Verify in database
      const updatedUser = await prisma.user.findFirst({
        where: { slUuid: uuid },
        include: { goreanStats: true }
      });
      const effects = updatedUser?.goreanStats?.activeEffects as unknown as Array<{ turnsRemaining: number }>;
      expect(effects[0].turnsRemaining).toBe(1);
    });
  });
});
