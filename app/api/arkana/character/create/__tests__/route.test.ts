import { POST } from '../route';
import { arkanaCharacterCreateSchema } from '@/lib/validation';
import {
  createMockPostRequest,
  createTestUser,
  cleanupDatabase,
  expectSuccess,
  expectError,
  parseJsonResponse,
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';

describe('/api/arkana/character/create', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  describe('API Endpoint Tests', () => {
    it('should create a complete Arkana character successfully', async () => {
      const { user, token } = await createTestUser('arkana');

      const characterData = {
        characterName: 'Test Character',
        agentName: 'TestAgent',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        flaws: ['flaw_addiction'],
        picks: ['perk_tech_savvy'],
        cyberSlots: 0,
        token: token,
        universe: 'arkana'
      };

      const request = createMockPostRequest('/api/arkana/character/create', characterData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.message).toBe('Arkana character created successfully');
      expect(data.data.arkanaStats.characterName).toBe('Test Character');
      expect(data.data.arkanaStats.race).toBe('human');
      expect(data.data.arkanaStats.archetype).toBe('Arcanist');
      expect(data.data.arkanaStats.hitPoints).toBe(10); // physical * 5
      expect(data.data.user.uuid).toBe(user.slUuid);
    });

    it('should create character with new arkana-data fields', async () => {
      const { token } = await createTestUser('arkana');

      const characterData = {
        characterName: 'Test Character',
        agentName: 'TestAgent',
        race: 'human',
        archetype: 'Synthral',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        flaws: ['flaw_addiction', 'flaw_phobia'],
        picks: ['perk_tech_savvy', 'power_enhanced_reflexes'],
        cybernetics: ['cyber_neural_interface', 'cyber_data_jack'],
        cyberSlots: 3,
        freeMagicSchool: 'school_technomancy',
        freeMagicWeave: 'weave_data_stream',
        synthralFreeWeave: 'weave_neural_link',
        token: token,
        universe: 'arkana'
      };

      const request = createMockPostRequest('/api/arkana/character/create', characterData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.arkanaStats.characterName).toBe('Test Character');
      expect(data.data.arkanaStats.race).toBe('human');
      expect(data.data.arkanaStats.archetype).toBe('Synthral');
      expect(data.data.arkanaStats.hitPoints).toBe(10); // physical * 5
    });

    it('should return 401 for invalid token', async () => {
      const characterData = {
        characterName: 'Test Character',
        agentName: 'TestAgent',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        token: 'invalid-token',
        universe: 'arkana'
      };

      const request = createMockPostRequest('/api/arkana/character/create', characterData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(401);
    });

    it('should return 401 for wrong universe token', async () => {
      // Create a user in Gor universe (no token will be generated)
      await createTestUser({
        sl_uuid: '550e8400-e29b-41d4-a716-446655440099',
        universe: 'gor',
        username: 'GorTestUser',
        role: 'Free'
      });

      const characterData = {
        characterName: 'Test Character',
        agentName: 'TestAgent',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        token: 'any-token', // This will be invalid anyway since no token was created
        universe: 'arkana'
      };

      const request = createMockPostRequest('/api/arkana/character/create', characterData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(401);
    });

    it('should return 400 for invalid stat allocation', async () => {
      const { token } = await createTestUser('arkana');

      const characterData = {
        characterName: 'Test Character',
        agentName: 'TestAgent',
        race: 'human',
        archetype: 'Arcanist',
        physical: 5, // Too many points
        dexterity: 5,
        mental: 5,
        perception: 5,
        token: token,
        universe: 'arkana'
      };

      const request = createMockPostRequest('/api/arkana/character/create', characterData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(400);
      expect(data.error).toContain('failed custom validation');
    });

    it('should return 400 for missing required fields', async () => {
      const { token } = await createTestUser('arkana');

      const characterData = {
        // Missing characterName
        agentName: 'TestAgent',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        token: token,
        universe: 'arkana'
      };

      const request = createMockPostRequest('/api/arkana/character/create', characterData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(400);
      expect(data.error).toContain('characterName');
    });
  });

  describe('Validation Schema Tests', () => {
    it('should accept lowercase race values', () => {
      const payload = {
        characterName: 'Test Character',
        agentName: 'TestAgent',
        race: 'human', // lowercase
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        token: 'test-token',
        universe: 'arkana'
      };

      const { error } = arkanaCharacterCreateSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('should accept capitalized race values and transform to lowercase', () => {
      const payload = {
        characterName: 'Test Character',
        agentName: 'TestAgent',
        race: 'Human', // capitalized
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        token: 'test-token',
        universe: 'arkana'
      };

      const { error, value } = arkanaCharacterCreateSchema.validate(payload);
      expect(error).toBeUndefined();
      expect(value.race).toBe('human'); // Should be transformed to lowercase
    });

    it('should accept uppercase race values and transform to lowercase', () => {
      const payload = {
        characterName: 'Test Character',
        agentName: 'TestAgent',
        race: 'HUMAN', // uppercase
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        token: 'test-token',
        universe: 'arkana'
      };

      const { error, value } = arkanaCharacterCreateSchema.validate(payload);
      expect(error).toBeUndefined();
      expect(value.race).toBe('human'); // Should be transformed to lowercase
    });

    it('should reject invalid race values', () => {
      const payload = {
        characterName: 'Test Character',
        agentName: 'TestAgent',
        race: 'invalid-race',
        archetype: 'Arcanist',
        physical: 3,
        dexterity: 3,
        mental: 4,
        perception: 4,
        token: 'test-token',
        universe: 'arkana'
      };

      const { error } = arkanaCharacterCreateSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('must be one of');
    });

    it('should accept new arkana-data-main fields', () => {
      const payload = {
        characterName: 'Test Character',
        agentName: 'TestAgent',
        race: 'human',
        archetype: 'Synthral',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        picks: ['perk_tech_savvy', 'power_enhanced_reflexes'],
        flaws: ['flaw_addiction', 'flaw_phobia'], // array of string IDs
        cybernetics: ['cyber_neural_interface', 'cyber_data_jack'], // array of string IDs
        cyberSlots: 3,
        freeMagicSchool: 'school_technomancy',
        freeMagicWeave: 'weave_data_stream',
        synthralFreeWeave: 'weave_neural_link',
        token: 'test-token',
        universe: 'arkana'
      };

      const { error } = arkanaCharacterCreateSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('should validate cyberSlots range (0-10)', () => {
      const payload = {
        characterName: 'Test Character',
        agentName: 'TestAgent',
        race: 'human',
        archetype: 'Synthral',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        cyberSlots: 15, // invalid - too high
        token: 'test-token',
        universe: 'arkana'
      };

      const { error } = arkanaCharacterCreateSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('must be less than or equal to 10');
    });

  });
});