import { GET, POST } from '../route';
import { prisma } from '@/lib/prisma';
import { generateSignature } from '@/lib/signature';
import {
  createMockPostRequest,
  createMockGetRequest,
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

// Helper to create a test Gorean character with abilities
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
          healthMax: 88,
          healthCurrent: 88,
          hungerMax: 100,
          hungerCurrent: 100,
          thirstMax: 100,
          thirstCurrent: 100,
          skills: [],
          abilities: overrides.abilities || [],
          activeEffects: [],
          liveStats: {},
          xp: 0,
          registrationCompleted: true
        }
      }
    }
  });

  return { uuid, username, user };
}

describe('GET/POST /api/gor/combat/user-abilities', () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Validation', () => {
    it('should reject request without player_uuid', async () => {
      const body = createRequestBody({});

      const request = createMockPostRequest('/api/gor/combat/user-abilities', body);
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

      const request = createMockPostRequest('/api/gor/combat/user-abilities', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'signature');
    });

    it('should reject invalid type filter', async () => {
      const body = createRequestBody({
        player_uuid: crypto.randomUUID(),
        type: 'invalid_type'
      });

      const request = createMockPostRequest('/api/gor/combat/user-abilities', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'type');
    });
  });

  describe('User Not Found', () => {
    it('should return 404 for non-existent user', async () => {
      const body = createRequestBody({
        player_uuid: crypto.randomUUID()
      });

      const request = createMockPostRequest('/api/gor/combat/user-abilities', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'not found');
    });
  });

  describe('Abilities List', () => {
    it('should return empty list when user has no abilities', async () => {
      const { uuid } = await createTestCharacter({
        abilities: []
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/user-abilities', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.abilities).toEqual([]);
    });

    it('should return abilities list when user has abilities', async () => {
      const { uuid } = await createTestCharacter({
        abilities: [
          { ability_id: 'combat_expertise', ability_name: 'Combat Expertise' },
          { ability_id: 'second_wind', ability_name: 'Second Wind' }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/user-abilities', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.abilities.length).toBe(2);
      expect(data.data.abilities[0]).toHaveProperty('id');
      expect(data.data.abilities[0]).toHaveProperty('name');
      expect(data.data.abilities[0]).toHaveProperty('abilityType');
    });

    it('should filter abilities by type "ability"', async () => {
      const { uuid } = await createTestCharacter({
        abilities: [
          { ability_id: 'combat_expertise', ability_name: 'Combat Expertise' },
          { ability_id: 'second_wind', ability_name: 'Second Wind' }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid,
        type: 'ability'
      });

      const request = createMockPostRequest('/api/gor/combat/user-abilities', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // All test abilities have abilityType: ['ability']
      expect(data.data.abilities.length).toBeGreaterThan(0);
      data.data.abilities.forEach((ability: { abilityType: string }) => {
        expect(['ability', 'both']).toContain(ability.abilityType);
      });
    });

    it('should skip abilities not found in definitions', async () => {
      const { uuid } = await createTestCharacter({
        abilities: [
          { ability_id: 'nonexistent_ability', ability_name: 'Nonexistent' },
          { ability_id: 'combat_expertise', ability_name: 'Combat Expertise' }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid
      });

      const request = createMockPostRequest('/api/gor/combat/user-abilities', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Only valid ability should be returned
      expect(data.data.abilities.length).toBe(1);
      expect(data.data.abilities[0].id).toBe('combat_expertise');
    });

    it('should return 0 abilities when ability_id has wrong case', async () => {
      const { uuid } = await createTestCharacter({
        abilities: [
          { ability_id: 'Combat_Expertise', ability_name: 'Combat Expertise' },
          { ability_id: 'Second_Wind', ability_name: 'Second Wind' }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid,
        type: 'ability'
      });

      const request = createMockPostRequest('/api/gor/combat/user-abilities', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Abilities won't match because IDs are case-sensitive
      expect(data.data.abilities.length).toBe(0);
    });

    it('should return 0 abilities when ability_id uses spaces instead of underscores', async () => {
      const { uuid } = await createTestCharacter({
        abilities: [
          { ability_id: 'combat expertise', ability_name: 'Combat Expertise' },
          { ability_id: 'second wind', ability_name: 'Second Wind' }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid,
        type: 'ability'
      });

      const request = createMockPostRequest('/api/gor/combat/user-abilities', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Abilities won't match because IDs use spaces instead of underscores
      expect(data.data.abilities.length).toBe(0);
    });

    it('should return abilities when data includes extra "uses" field', async () => {
      // Test with exact production data format that includes "uses" field
      const { uuid } = await createTestCharacter({
        abilities: [
          { uses: 0, ability_id: 'combat_expertise', ability_name: 'Combat Expertise' },
          { uses: 0, ability_id: 'capture_throw', ability_name: 'Capture Throw' },
          { uses: 0, ability_id: 'tactical_command', ability_name: 'Tactical Command' }
        ]
      });

      const body = createRequestBody({
        player_uuid: uuid,
        type: 'ability'
      });

      const request = createMockPostRequest('/api/gor/combat/user-abilities', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // All 3 abilities have abilityType: ['ability'] so should be returned
      expect(data.data.abilities.length).toBe(3);
    });

    it('should work with GET request using query params', async () => {
      const { uuid } = await createTestCharacter({
        abilities: [
          { ability_id: 'combat_expertise', ability_name: 'Combat Expertise' }
        ]
      });

      const timestamp = new Date().toISOString();
      const universe = 'gor';
      const signature = generateSignature(timestamp, universe);

      const url = `/api/gor/combat/user-abilities?player_uuid=${uuid}&universe=${universe}&timestamp=${encodeURIComponent(timestamp)}&signature=${signature}`;
      const request = createMockGetRequest(url);
      const response = await GET(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.abilities.length).toBe(1);
    });
  });
});
