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
      expect(data.data.detailedMessage).toBeDefined();
      expect(data.data.confirmMessage).toBeDefined();
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

      expectError(data, 'Player does not own this ability');
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

      expectError(data, 'Ability not found');
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

    it('should return URL-encoded detailedMessage and confirmMessage', async () => {
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

      // Both messages should be URL-encoded strings
      expect(typeof data.data.detailedMessage).toBe('string');
      expect(typeof data.data.confirmMessage).toBe('string');

      // Decode messages
      const detailed = decodeURIComponent(data.data.detailedMessage);
      const confirm = decodeURIComponent(data.data.confirmMessage);

      // Detailed message should contain power name and emoji
      expect(detailed).toContain('⚡');
      expect(detailed).toContain('Hypnosis');

      // Confirm message should be briefer
      expect(confirm).toContain('⚡');
      expect(confirm).toContain('Hypnosis');
    });

    it('should include effect details in detailedMessage', async () => {
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

      const detailed = decodeURIComponent(data.data.detailedMessage);

      // Should NOT include cost in detailed message
      expect(detailed).not.toContain('Cost:');

      // Should include range and target metadata
      expect(detailed).toContain('Range:');
      expect(detailed).toContain('Target:');

      // Should include effects section
      expect(detailed).toContain('Effects:');
    });

    it('should format detailedMessage with power metadata and effects', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Veilborn',
        race: 'veilborn',
        archetype: 'Emotion',
        physical: 2,
        dexterity: 3,
        mental: 6,
        perception: 4,
        hitPoints: 14,
        commonPowers: ['veil_emotion_theft'],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        power_id: 'veil_emotion_theft',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-info', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      const detailed = decodeURIComponent(data.data.detailedMessage);

      // Should include power name and description
      expect(detailed).toContain('Emotion Theft');
      expect(detailed).toContain('Siphon dominant emotion');

      // Should show stat modifiers with duration and target
      expect(detailed).toMatch(/-1 Mental.*\[Enemy\]/); // debuff targeting enemy
      expect(detailed).toMatch(/\+1 Mental.*\[Self\]/); // buff targeting self
    });

    it('should format utility and defense effects correctly', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Test User',
        race: 'human',
        archetype: 'Life',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 15,
        commonPowers: ['test_defense_harden_skin', 'test_utility_sensor_sweep'],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();

      // Test defense power
      const defenseRequest = createMockPostRequest('/api/arkana/combat/power-info', {
        player_uuid: player.slUuid,
        power_id: 'test_defense_harden_skin',
        universe: 'arkana',
        timestamp: timestamp,
        signature: generateSignature(timestamp, 'arkana')
      });

      const defenseResponse = await POST(defenseRequest);
      const defenseData = await parseJsonResponse(defenseResponse);

      const defenseDetailed = decodeURIComponent(defenseData.data.detailedMessage);
      expect(defenseDetailed).toContain('Damage Reduction');
      expect(defenseDetailed).toMatch(/-3/);

      // Test utility power
      const utilityRequest = createMockPostRequest('/api/arkana/combat/power-info', {
        player_uuid: player.slUuid,
        power_id: 'test_utility_sensor_sweep',
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: generateSignature(new Date().toISOString(), 'arkana')
      });

      const utilityResponse = await POST(utilityRequest);
      const utilityData = await parseJsonResponse(utilityResponse);

      const utilityDetailed = decodeURIComponent(utilityData.data.detailedMessage);
      expect(utilityDetailed).toContain('Sensor Sweep');
      expect(utilityDetailed).toMatch(/eavesdrop|detect magic/i);
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

    it('should accept use_mode parameter with valid values', () => {
      const modes = ['attack', 'ability', 'all'];

      modes.forEach(mode => {
        const payload = {
          player_uuid: generateTestUUID(),
          power_id: 'some_power',
          use_mode: mode,
          universe: 'arkana',
          timestamp: new Date().toISOString(),
          signature: 'a'.repeat(64)
        };

        const { error } = arkanaPowerInfoSchema.validate(payload);
        expect(error).toBeUndefined();
      });
    });

    it('should default use_mode to "all" when not provided', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        power_id: 'some_power',
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error, value } = arkanaPowerInfoSchema.validate(payload);
      expect(error).toBeUndefined();
      expect(value.use_mode).toBe('all');
    });

    it('should reject invalid use_mode value', () => {
      const payload = {
        player_uuid: generateTestUUID(),
        power_id: 'some_power',
        use_mode: 'invalid_mode',
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaPowerInfoSchema.validate(payload);
      expect(error).toBeDefined();
    });
  });

  describe('Use Mode Filter Tests', () => {
    it('should show only ability effects when use_mode is "ability" (Chi Manipulation example)', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Gaki Healer',
        race: 'gaki',
        archetype: 'Life',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 12,
        commonPowers: ['gaki_chi_manipulation'],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        power_id: 'gaki_chi_manipulation',
        use_mode: 'ability',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-info', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      const detailed = decodeURIComponent(data.data.detailedMessage);

      // Should include ability effect (Chi Balance Restoration / cleanse)
      expect(detailed).toMatch(/Chi Balance Restoration|Heals.*HP/i);

      // Should NOT include attack effects (check or debuff)
      expect(detailed).not.toContain('Mental Check vs Mental Defense');
      expect(detailed).not.toMatch(/-1 Mental.*\(2 turns\)/);
    });

    it('should show only attack effects when use_mode is "attack" (Chi Manipulation example)', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Gaki Fighter',
        race: 'gaki',
        archetype: 'Life',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 12,
        commonPowers: ['gaki_chi_manipulation'],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const requestData = {
        player_uuid: player.slUuid,
        power_id: 'gaki_chi_manipulation',
        use_mode: 'attack',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-info', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      const detailed = decodeURIComponent(data.data.detailedMessage);

      // Should include attack effects (check and debuff)
      expect(detailed).toContain('Mental Check vs Mental Defense');
      expect(detailed).toMatch(/-1 Mental.*\(2 turns\)/);

      // Should NOT include ability effect (cleanse)
      expect(detailed).not.toMatch(/Chi Balance Restoration|Heals.*HP/i);
    });

    it('should show all effects when use_mode is "all" or not specified', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Gaki Versatile',
        race: 'gaki',
        archetype: 'Life',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 12,
        commonPowers: ['gaki_chi_manipulation'],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      // Test with use_mode="all"
      const requestDataAll = {
        player_uuid: player.slUuid,
        power_id: 'gaki_chi_manipulation',
        use_mode: 'all',
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const requestAll = createMockPostRequest('/api/arkana/combat/power-info', requestDataAll);
      const responseAll = await POST(requestAll);
      const dataAll = await parseJsonResponse(responseAll);

      expectSuccess(dataAll);

      const detailedAll = decodeURIComponent(dataAll.data.detailedMessage);

      // Should include BOTH attack and ability effects
      expect(detailedAll).toContain('Mental Check vs Mental Defense');
      expect(detailedAll).toMatch(/-1 Mental.*\(2 turns\)/);
      expect(detailedAll).toMatch(/Chi Balance Restoration|Heals.*HP/i);

      // Test without use_mode (defaults to "all")
      const timestamp2 = new Date().toISOString();
      const requestDataDefault = {
        player_uuid: player.slUuid,
        power_id: 'gaki_chi_manipulation',
        universe: 'arkana',
        timestamp: timestamp2,
        signature: generateSignature(timestamp2, 'arkana')
      };

      const requestDefault = createMockPostRequest('/api/arkana/combat/power-info', requestDataDefault);
      const responseDefault = await POST(requestDefault);
      const dataDefault = await parseJsonResponse(responseDefault);

      expectSuccess(dataDefault);

      const detailedDefault = decodeURIComponent(dataDefault.data.detailedMessage);

      // Should also include both attack and ability effects
      expect(detailedDefault).toContain('Mental Check vs Mental Defense');
      expect(detailedDefault).toMatch(/-1 Mental.*\(2 turns\)/);
      expect(detailedDefault).toMatch(/Chi Balance Restoration|Heals.*HP/i);
    });

    it('should handle use_mode with powers that have no matching effect type', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Strigoi Passive',
        race: 'strigoi',
        archetype: 'Life',
        physical: 3,
        dexterity: 2,
        mental: 4,
        perception: 3,
        hitPoints: 15,
        commonPowers: ['strigoi_wall_walking'],
        archetypePowers: []
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      // strigoi_wall_walking has only passive effects, no attack effects
      const requestData = {
        player_uuid: player.slUuid,
        power_id: 'strigoi_wall_walking',
        use_mode: 'attack', // Even though power has no attack effects
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/power-info', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      const detailed = decodeURIComponent(data.data.detailedMessage);

      // Should still show passive effects even when use_mode is "attack"
      expect(detailed).toMatch(/Wall.*Climbing/i);
    });
  });
});
