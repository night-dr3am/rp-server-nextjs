import { POST } from '../route';
import { arkanaFirstAidSchema } from '@/lib/validation';
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

describe('/api/arkana/combat/first-aid', () => {
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
    maxHP: number;
  }, health?: number) {
    const { user } = await createTestUser('arkana');

    // Create userStats
    await prisma.userStats.create({
      data: {
        userId: user.id,
        health: health !== undefined ? health : 100,
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
    it('should process a successful first aid (always succeeds with no cooldown)', async () => {
      // Create healer
      const healer = await createArkanaTestUser({
        characterName: 'Skilled Medic',
        race: 'human',
        archetype: 'Healer',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 5,
        maxHP: 10
      });

      // Create target with low health
      const target = await createArkanaTestUser({
        characterName: 'Wounded Fighter',
        race: 'human',
        archetype: 'Fighter',
        physical: 5,
        dexterity: 3,
        mental: 2,
        perception: 2,
        maxHP: 25
      }, 5); // Only 5 HP

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const firstAidData = {
        healer_uuid: healer.slUuid,
        target_uuid: target.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/first-aid', firstAidData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.isSuccess).toBe('true');
      expect(data.data.healingAmount).toBe(1);
      expect(data.data.target.healthBefore).toBe(5);
      expect(data.data.target.healthAfter).toBe(6);
      expect(data.data.message).toContain('Skilled%20Medic');
      expect(data.data.message).toContain('Wounded%20Fighter');
      expect(data.data.healer.name).toBe('Skilled%20Medic');
      expect(data.data.target.name).toBe('Wounded%20Fighter');
    });

    it('should allow self-healing', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Self Healer',
        race: 'human',
        archetype: 'Medic',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 4,
        maxHP: 15
      }, 8); // Low health

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const firstAidData = {
        healer_uuid: player.slUuid,
        target_uuid: player.slUuid, // Same UUID for self-healing
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/first-aid', firstAidData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.isSuccess).toBe('true');
      expect(data.data.healingAmount).toBe(1);
      expect(data.data.healer.uuid).toBe(player.slUuid);
      expect(data.data.target.uuid).toBe(player.slUuid);
      expect(data.data.healer.name).toBe('Self%20Healer');
      expect(data.data.target.name).toBe('Self%20Healer');
      expect(data.data.target.healthBefore).toBe(8);
      expect(data.data.target.healthAfter).toBe(9);
    });

    it('should enforce 30-minute cooldown', async () => {
      const healer = await createArkanaTestUser({
        characterName: 'Medic',
        race: 'human',
        archetype: 'Healer',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 5,
        maxHP: 10
      });

      const target = await createArkanaTestUser({
        characterName: 'Patient',
        race: 'human',
        archetype: 'Fighter',
        physical: 5,
        dexterity: 3,
        mental: 2,
        perception: 2,
        maxHP: 25
      }, 10);

      // Create a recent first aid event (within cooldown)
      await prisma.event.create({
        data: {
          userId: healer.id,
          type: 'FIRST_AID',
          details: {
            targetUuid: target.slUuid,
            targetName: 'Patient',
            isSuccess: true
          }
        }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const firstAidData = {
        healer_uuid: healer.slUuid,
        target_uuid: target.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/first-aid', firstAidData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'First aid on cooldown');
      expect(response.status).toBe(400);
      expect(data.error).toContain('minutes remaining');
    });

    it('should allow first aid after cooldown expires', async () => {
      const healer = await createArkanaTestUser({
        characterName: 'Medic',
        race: 'human',
        archetype: 'Healer',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 5,
        maxHP: 10
      });

      const target = await createArkanaTestUser({
        characterName: 'Patient',
        race: 'human',
        archetype: 'Fighter',
        physical: 5,
        dexterity: 3,
        mental: 2,
        perception: 2,
        maxHP: 25
      }, 10);

      // Create an old first aid event (outside cooldown - 31 minutes ago)
      const thirtyOneMinutesAgo = new Date(Date.now() - 31 * 60 * 1000);
      await prisma.event.create({
        data: {
          userId: healer.id,
          type: 'FIRST_AID',
          timestamp: thirtyOneMinutesAgo,
          details: {
            targetUuid: target.slUuid,
            targetName: 'Patient'
          }
        }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const firstAidData = {
        healer_uuid: healer.slUuid,
        target_uuid: target.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/first-aid', firstAidData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data); // Should succeed since cooldown expired
    });

    it('should not heal beyond max hit points', async () => {
      const healer = await createArkanaTestUser({
        characterName: 'Healer',
        race: 'human',
        archetype: 'Healer',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 5,
        maxHP: 10
      });

      const target = await createArkanaTestUser({
        characterName: 'Healthy Fighter',
        race: 'human',
        archetype: 'Fighter',
        physical: 5,
        dexterity: 3,
        mental: 2,
        perception: 2,
        maxHP: 25
      }, 25); // Already at max HP

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const firstAidData = {
        healer_uuid: healer.slUuid,
        target_uuid: target.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/first-aid', firstAidData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.isSuccess).toBe('true');
      expect(data.data.healingAmount).toBe(1);
      expect(data.data.target.healthBefore).toBe(25);
      expect(data.data.target.healthAfter).toBe(25); // Capped at max
      expect(data.data.target.healthAfter).toBeLessThanOrEqual(25);
    });

    it('should return 404 for non-existent healer', async () => {
      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Mage',
        physical: 2,
        dexterity: 2,
        mental: 5,
        perception: 3,
        maxHP: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const firstAidData = {
        healer_uuid: generateTestUUID(), // Non-existent UUID
        target_uuid: target.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/first-aid', firstAidData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Healer not found in Arkana universe');
      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent target', async () => {
      const healer = await createArkanaTestUser({
        characterName: 'Healer',
        race: 'human',
        archetype: 'Healer',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 5,
        maxHP: 10
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const firstAidData = {
        healer_uuid: healer.slUuid,
        target_uuid: generateTestUUID(), // Non-existent UUID
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/first-aid', firstAidData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Target not found in Arkana universe');
      expect(response.status).toBe(404);
    });

    it('should return 400 for incomplete healer registration', async () => {
      const { user: healer } = await createTestUser('arkana');
      await prisma.userStats.create({
        data: {
          userId: healer.id,
          health: 100,
          hunger: 100,
          thirst: 100,
          copperCoin: 100
        }
      });
      await prisma.arkanaStats.create({
        data: {
          userId: healer.id,
          characterName: 'Incomplete Healer',
          agentName: healer.username + ' Resident',
          race: 'human',
          archetype: 'Healer',
          physical: 2,
          dexterity: 2,
          mental: 3,
          perception: 5,
          maxHP: 10,
          registrationCompleted: false // Not completed!
        }
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Fighter',
        physical: 5,
        dexterity: 3,
        mental: 2,
        perception: 2,
        maxHP: 25
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const firstAidData = {
        healer_uuid: healer.slUuid,
        target_uuid: target.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/first-aid', firstAidData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Healer registration incomplete');
      expect(response.status).toBe(400);
    });

    it('should return 400 for incomplete target registration', async () => {
      const healer = await createArkanaTestUser({
        characterName: 'Healer',
        race: 'human',
        archetype: 'Healer',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 5,
        maxHP: 10
      });

      const { user: target } = await createTestUser('arkana');
      await prisma.userStats.create({
        data: {
          userId: target.id,
          health: 100,
          hunger: 100,
          thirst: 100,
          copperCoin: 100
        }
      });
      await prisma.arkanaStats.create({
        data: {
          userId: target.id,
          characterName: 'Incomplete Target',
          agentName: target.username + ' Resident',
          race: 'human',
          archetype: 'Fighter',
          physical: 5,
          dexterity: 3,
          mental: 2,
          perception: 2,
          maxHP: 25,
          registrationCompleted: false // Not completed!
        }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const firstAidData = {
        healer_uuid: healer.slUuid,
        target_uuid: target.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/first-aid', firstAidData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Target registration incomplete');
      expect(response.status).toBe(400);
    });

    it('should return 400 when target is not in RP mode', async () => {
      const healer = await createArkanaTestUser({
        characterName: 'Healer',
        race: 'human',
        archetype: 'Healer',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 5,
        maxHP: 10
      });

      const target = await createArkanaTestUser({
        characterName: 'OOC Patient',
        race: 'human',
        archetype: 'Fighter',
        physical: 5,
        dexterity: 3,
        mental: 2,
        perception: 2,
        maxHP: 25
      }, 10);

      // Set target status to 1 (OOC mode, not in RP)
      await prisma.userStats.update({
        where: { userId: target.id },
        data: { status: 1 }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const firstAidData = {
        healer_uuid: healer.slUuid,
        target_uuid: target.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/first-aid', firstAidData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Target player is not in RP mode');
      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid signature', async () => {
      const healer = await createArkanaTestUser({
        characterName: 'Healer',
        race: 'human',
        archetype: 'Healer',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 5,
        maxHP: 10
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Fighter',
        physical: 5,
        dexterity: 3,
        mental: 2,
        perception: 2,
        maxHP: 25
      });

      const firstAidData = {
        healer_uuid: healer.slUuid,
        target_uuid: target.slUuid,
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'invalid-signature'
      };

      const request = createMockPostRequest('/api/arkana/combat/first-aid', firstAidData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(response.status).toBe(400); // Should be 400 for validation error
    });

    it('should return string booleans for LSL compatibility', async () => {
      const healer = await createArkanaTestUser({
        characterName: 'Healer',
        race: 'human',
        archetype: 'Healer',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 5,
        maxHP: 10
      });

      const target = await createArkanaTestUser({
        characterName: 'Target',
        race: 'human',
        archetype: 'Fighter',
        physical: 5,
        dexterity: 3,
        mental: 2,
        perception: 2,
        maxHP: 25
      }, 10);

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const firstAidData = {
        healer_uuid: healer.slUuid,
        target_uuid: target.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/first-aid', firstAidData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // isSuccess must be a string, not a boolean, for LSL JSON parsing
      expect(typeof data.data.isSuccess).toBe('string');
      expect(data.data.isSuccess).toBe('true'); // Always true when cooldown passed
    });

    it('should record event for cooldown tracking', async () => {
      const healer = await createArkanaTestUser({
        characterName: 'Medic',
        race: 'human',
        archetype: 'Healer',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 5,
        maxHP: 10
      });

      const target = await createArkanaTestUser({
        characterName: 'Patient',
        race: 'human',
        archetype: 'Fighter',
        physical: 5,
        dexterity: 3,
        mental: 2,
        perception: 2,
        maxHP: 25
      }, 10);

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const firstAidData = {
        healer_uuid: healer.slUuid,
        target_uuid: target.slUuid,
        universe: 'arkana',
        timestamp: timestamp,
        signature: signature
      };

      const request = createMockPostRequest('/api/arkana/combat/first-aid', firstAidData);
      await POST(request);

      // Verify event was created
      const event = await prisma.event.findFirst({
        where: {
          userId: healer.id,
          type: 'FIRST_AID'
        }
      });

      expect(event).toBeTruthy();
      expect(event?.details).toHaveProperty('targetUuid', target.slUuid);
      expect(event?.details).toHaveProperty('targetName', 'Patient');
      expect(event?.details).toHaveProperty('healingAmount', 1);
      expect(event?.details).toHaveProperty('healthBefore');
      expect(event?.details).toHaveProperty('healthAfter');
    });
  });

  describe('Validation Schema Tests', () => {
    it('should accept valid first aid data', () => {
      const payload = {
        healer_uuid: generateTestUUID(),
        target_uuid: generateTestUUID(),
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64) // Valid 64-char hex signature
      };

      const { error } = arkanaFirstAidSchema.validate(payload);
      expect(error).toBeUndefined();
    });

    it('should reject missing healer_uuid', () => {
      const payload = {
        target_uuid: generateTestUUID(),
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaFirstAidSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('healer_uuid');
    });

    it('should reject missing target_uuid', () => {
      const payload = {
        healer_uuid: generateTestUUID(),
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaFirstAidSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('target_uuid');
    });

    it('should reject invalid UUID format', () => {
      const payload = {
        healer_uuid: 'not-a-valid-uuid',
        target_uuid: generateTestUUID(),
        universe: 'arkana',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaFirstAidSchema.validate(payload);
      expect(error).toBeDefined();
    });

    it('should reject non-arkana universe', () => {
      const payload = {
        healer_uuid: generateTestUUID(),
        target_uuid: generateTestUUID(),
        universe: 'gor',
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaFirstAidSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('must be [arkana]');
    });

    it('should reject missing universe', () => {
      const payload = {
        healer_uuid: generateTestUUID(),
        target_uuid: generateTestUUID(),
        timestamp: new Date().toISOString(),
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaFirstAidSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('universe');
    });

    it('should reject missing timestamp', () => {
      const payload = {
        healer_uuid: generateTestUUID(),
        target_uuid: generateTestUUID(),
        universe: 'arkana',
        signature: 'a'.repeat(64)
      };

      const { error } = arkanaFirstAidSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('timestamp');
    });

    it('should reject missing signature', () => {
      const payload = {
        healer_uuid: generateTestUUID(),
        target_uuid: generateTestUUID(),
        universe: 'arkana',
        timestamp: new Date().toISOString()
      };

      const { error } = arkanaFirstAidSchema.validate(payload);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('signature');
    });

    it('should require all fields', () => {
      const payload = {
        healer_uuid: generateTestUUID()
        // Missing target_uuid, universe, timestamp, signature
      };

      const { error } = arkanaFirstAidSchema.validate(payload);
      expect(error).toBeDefined();
    });
  });
});
