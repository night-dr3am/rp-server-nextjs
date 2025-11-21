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

describe('POST /api/gor/combat/end-scene', () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Validation', () => {
    it('should reject request without player_uuid', async () => {
      const body = createRequestBody({});

      const request = createMockPostRequest('/api/gor/combat/end-scene', body);
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

      const request = createMockPostRequest('/api/gor/combat/end-scene', body);
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

      const request = createMockPostRequest('/api/gor/combat/end-scene', body);
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

      const request = createMockPostRequest('/api/gor/combat/end-scene', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'not found');
    });
  });

  describe('Scene Clearing', () => {
    it('should handle empty effects array', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: []
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/end-scene', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsRemoved).toBe(0);
      expect(data.data.effectsRemaining).toBe(0);
    });

    it('should clear all turn-based effects', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: [
          {
            effectId: 'buff1',
            name: 'Buff 1',
            category: 'stat_modifier',
            turnsRemaining: 3,
            stat: 'Strength',
            modifier: 5,
            duration: 'turns:3'
          },
          {
            effectId: 'buff2',
            name: 'Buff 2',
            category: 'stat_modifier',
            turnsRemaining: 5,
            stat: 'Agility',
            modifier: 3,
            duration: 'turns:5'
          }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/end-scene', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsRemoved).toBe(2);
      expect(data.data.effectsRemaining).toBe(0);

      // Verify in database
      const updatedUser = await prisma.user.findFirst({
        where: { slUuid: uuid },
        include: { goreanStats: true }
      });
      const effects = updatedUser?.goreanStats?.activeEffects as unknown as Array<unknown>;
      expect(effects.length).toBe(0);
    });

    it('should clear all scene effects', async () => {
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

      const request = createMockPostRequest('/api/gor/combat/end-scene', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsRemoved).toBe(1);
      expect(data.data.effectsRemaining).toBe(0);
    });

    it('should clear mixed turn-based and scene effects', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: [
          {
            effectId: 'turn_buff',
            name: 'Turn Buff',
            category: 'stat_modifier',
            turnsRemaining: 2,
            stat: 'Strength',
            modifier: 5,
            duration: 'turns:2'
          },
          {
            effectId: 'scene_buff',
            name: 'Scene Buff',
            category: 'stat_modifier',
            turnsRemaining: 999,
            sceneEffect: true,
            stat: 'Agility',
            modifier: 3,
            duration: 'scene'
          },
          {
            effectId: 'control_effect',
            name: 'Stunned',
            category: 'control',
            turnsRemaining: 1,
            controlType: 'stun',
            duration: 'turns:1'
          }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/end-scene', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsRemoved).toBe(3);
      expect(data.data.effectsRemaining).toBe(0);
    });

    it('should clear liveStats when all effects removed', async () => {
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
        ],
        liveStats: {
          Strength_rollbonus: 5
        }
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/end-scene', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify liveStats cleared in database
      const updatedUser = await prisma.user.findFirst({
        where: { slUuid: uuid },
        include: { goreanStats: true }
      });
      const liveStats = updatedUser?.goreanStats?.liveStats as unknown as Record<string, unknown>;
      expect(Object.keys(liveStats).length).toBe(0);
    });
  });

  describe('Response Format', () => {
    it('should return correct response structure', async () => {
      const { uuid } = await createTestCharacter({
        characterName: 'Tarl Cabot',
        activeEffects: []
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/end-scene', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data).toHaveProperty('playerName');
      expect(data.data).toHaveProperty('effectsRemoved');
      expect(data.data).toHaveProperty('effectsRemaining');
      expect(data.data).toHaveProperty('effectsDisplay');
      expect(data.data).toHaveProperty('message');
    });

    it('should return empty effectsDisplay after clearing', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: [
          {
            effectId: 'buff',
            name: 'Buff',
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

      const request = createMockPostRequest('/api/gor/combat/end-scene', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsDisplay).toBe('');
    });

    it('should include effect count in message', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: [
          {
            effectId: 'buff1',
            name: 'Buff 1',
            category: 'stat_modifier',
            turnsRemaining: 3,
            stat: 'Strength',
            modifier: 5,
            duration: 'turns:3'
          },
          {
            effectId: 'buff2',
            name: 'Buff 2',
            category: 'stat_modifier',
            turnsRemaining: 5,
            stat: 'Agility',
            modifier: 3,
            duration: 'turns:5'
          }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/end-scene', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      const message = decodeURIComponent(data.data.message);
      expect(message).toContain('2');
      expect(message).toContain('cleared');
    });
  });

  describe('Control Effects', () => {
    it('should clear control effects like stun and fear', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: [
          {
            effectId: 'stun_effect',
            name: 'Stunned',
            category: 'control',
            turnsRemaining: 2,
            controlType: 'stun',
            duration: 'turns:2'
          },
          {
            effectId: 'fear_effect',
            name: 'Feared',
            category: 'control',
            turnsRemaining: 3,
            controlType: 'fear',
            duration: 'turns:3'
          }
        ],
        liveStats: {
          stun: 'Stunned',
          fear: 'Feared'
        }
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/end-scene', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsRemoved).toBe(2);
      expect(data.data.effectsRemaining).toBe(0);

      // Verify control effects cleared from liveStats
      const updatedUser = await prisma.user.findFirst({
        where: { slUuid: uuid },
        include: { goreanStats: true }
      });
      const liveStats = updatedUser?.goreanStats?.liveStats as unknown as Record<string, unknown>;
      expect(liveStats.stun).toBeUndefined();
      expect(liveStats.fear).toBeUndefined();
    });
  });
});
