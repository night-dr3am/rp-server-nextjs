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
          health: overrides.healthCurrent !== undefined ? overrides.healthCurrent as number : 80,
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
          healthMax: overrides.healthMax !== undefined ? overrides.healthMax as number : 100,
          healthCurrent: overrides.healthCurrent !== undefined ? overrides.healthCurrent as number : 80,
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

describe('POST /api/gor/combat/defend', () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Validation', () => {
    it('should reject request without player_uuid', async () => {
      const body = createRequestBody({});

      const request = createMockPostRequest('/api/gor/combat/defend', body);
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

      const request = createMockPostRequest('/api/gor/combat/defend', body);
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

      const request = createMockPostRequest('/api/gor/combat/defend', body);
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

      const request = createMockPostRequest('/api/gor/combat/defend', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'not found');
    });
  });

  describe('Combat Restrictions', () => {
    it('should reject defend while unconscious', async () => {
      const { uuid } = await createTestCharacter({
        healthCurrent: 0
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/defend', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'unconscious');
    });

    it('should reject defend while stunned', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: [
          {
            effectId: 'control_stun_2',
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

      const request = createMockPostRequest('/api/gor/combat/defend', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'stunned');
    });

    it('should reject defend while asleep', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: [
          {
            effectId: 'control_sleep',
            name: 'Asleep',
            category: 'control',
            turnsRemaining: 2,
            controlType: 'sleep',
            duration: 'turns:2'
          }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/defend', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'asleep');
    });

    it('should reject defend while dazed', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: [
          {
            effectId: 'control_daze',
            name: 'Dazed',
            category: 'control',
            turnsRemaining: 1,
            controlType: 'daze',
            duration: 'turns:1'
          }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/defend', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'dazed');
    });
  });

  describe('Successful Defense', () => {
    it('should apply defense effect successfully', async () => {
      const { uuid } = await createTestCharacter({
        characterName: 'Tarl Cabot',
        activeEffects: []
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/defend', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data).toHaveProperty('displayMessage');
      expect(data.data).toHaveProperty('effectsDisplay');
      expect(data.data).toHaveProperty('effectsCount');

      const message = decodeURIComponent(data.data.displayMessage);
      expect(message).toContain('Tarl Cabot');
      expect(message).toContain('defensive stance');
      expect(message).toContain('+5');
    });

    it('should add defense effect to active effects', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: []
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/defend', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsCount).toBe(1);

      // Verify in database
      const updatedUser = await prisma.user.findFirst({
        where: { slUuid: uuid },
        include: { goreanStats: true }
      });

      const effects = updatedUser?.goreanStats?.activeEffects as unknown as Array<{
        effectId: string;
        turnsRemaining: number;
        stat: string;
        modifier: number;
      }>;

      expect(effects).toHaveLength(1);
      expect(effects[0].effectId).toBe('buff_defense_all_5');
      expect(effects[0].turnsRemaining).toBe(1);
      expect(effects[0].stat).toBe('all');
      expect(effects[0].modifier).toBe(5);
    });

    it('should stack with existing effects', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: [
          {
            effectId: 'strength_buff',
            name: 'Strength Buff',
            category: 'stat_modifier',
            turnsRemaining: 3,
            stat: 'Strength',
            modifier: 2,
            duration: 'turns:3'
          }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/defend', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsCount).toBe(2);

      // Verify in database
      const updatedUser = await prisma.user.findFirst({
        where: { slUuid: uuid },
        include: { goreanStats: true }
      });

      const effects = updatedUser?.goreanStats?.activeEffects as unknown as Array<{ effectId: string }>;
      expect(effects).toHaveLength(2);
      expect(effects.some(e => e.effectId === 'buff_defense_all_5')).toBe(true);
      expect(effects.some(e => e.effectId === 'strength_buff')).toBe(true);
    });

    it('should update liveStats with roll bonus', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: []
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/defend', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify liveStats in database
      const updatedUser = await prisma.user.findFirst({
        where: { slUuid: uuid },
        include: { goreanStats: true }
      });

      const liveStats = updatedUser?.goreanStats?.liveStats as unknown as Record<string, number>;
      // Defense buff is roll_bonus to all stats
      expect(liveStats.Strength_rollbonus).toBe(5);
      expect(liveStats.Agility_rollbonus).toBe(5);
      expect(liveStats.Intellect_rollbonus).toBe(5);
      expect(liveStats.Perception_rollbonus).toBe(5);
      expect(liveStats.Charisma_rollbonus).toBe(5);
    });
  });

  describe('Response Format', () => {
    it('should return correct response structure', async () => {
      const { uuid } = await createTestCharacter({
        characterName: 'Test Warrior'
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/defend', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data).toHaveProperty('displayMessage');
      expect(data.data).toHaveProperty('effectsDisplay');
      expect(data.data).toHaveProperty('effectsCount');
      expect(typeof data.data.effectsCount).toBe('number');
    });

    it('should include defense effect in effectsDisplay', async () => {
      const { uuid } = await createTestCharacter();

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/defend', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      const effectsDisplay = decodeURIComponent(data.data.effectsDisplay);
      // Should show 1t for 1 turn remaining
      expect(effectsDisplay).toContain('1t');
    });
  });
});
