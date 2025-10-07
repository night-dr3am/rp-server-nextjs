import { GET, PUT } from '../route';
import {
  createMockGetRequest,
  createMockPutRequest,
  cleanupDatabase,
  expectSuccess,
  expectError,
  parseJsonResponse,
  createTestUser
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { prisma } from '@/lib/prisma';

describe('GET/PUT /api/arkana/admin/user/[userId]', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  describe('GET', () => {
    it('should return full user data for admin', async () => {
      const { user: adminUser, token: adminToken } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: adminUser.id,
          characterName: 'Admin',
          agentName: 'Admin',
          race: 'Human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 3,
          mental: 3,
          perception: 3,
          hitPoints: 15,
          arkanaRole: 'admin',
          registrationCompleted: true
        }
      });

      const { user: targetUser } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: targetUser.id,
          characterName: 'Target User',
          agentName: 'TargetAgent',
          race: 'Gaki',
          archetype: 'Yin',
          physical: 4,
          dexterity: 3,
          mental: 2,
          perception: 3,
          hitPoints: 20,
          credits: 500,
          chips: 100,
          xp: 50,
          commonPowers: ['Enhanced Senses'],
          archetypePowers: ['Shadow Step'],
          perks: ['Night Vision'],
          magicSchools: ['Void Magic'],
          registrationCompleted: true
        }
      });

      await prisma.userStats.create({
        data: {
          userId: targetUser.id,
          health: 15,
          status: 0
        }
      });

      const request = createMockGetRequest(
        `/api/arkana/admin/user/${targetUser.id}?token=${adminToken}`
      );

      const params = Promise.resolve({ userId: targetUser.id });
      const response = await GET(request, { params });
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.user.id).toBe(targetUser.id);
      expect(data.data.arkanaStats.characterName).toBe('Target User');
      expect(data.data.arkanaStats.hitPoints).toBe(20);
      expect(data.data.stats.health).toBe(15);
      expect(data.data.arkanaStats.credits).toBe(500);
    });

    it('should deny access for non-admin', async () => {
      const { user: regularUser, token: regularToken } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: regularUser.id,
          characterName: 'Regular',
          agentName: 'Regular',
          race: 'Human',
          archetype: 'Synthral',
          physical: 2,
          dexterity: 2,
          mental: 2,
          perception: 2,
          hitPoints: 10,
          arkanaRole: 'player',
          registrationCompleted: true
        }
      });

      const { user: targetUser } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: targetUser.id,
          characterName: 'Target',
          agentName: 'Target',
          race: 'Human',
          archetype: 'Arcanist',
          physical: 2,
          dexterity: 2,
          mental: 2,
          perception: 2,
          hitPoints: 10,
          registrationCompleted: true
        }
      });

      const request = createMockGetRequest(
        `/api/arkana/admin/user/${targetUser.id}?token=${regularToken}`
      );

      const params = Promise.resolve({ userId: targetUser.id });
      const response = await GET(request, { params });
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(data.error).toContain('Access denied');
    });

    it('should return 404 for non-existent user', async () => {
      const { user: adminUser, token: adminToken } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: adminUser.id,
          characterName: 'Admin',
          agentName: 'Admin',
          race: 'Human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 3,
          mental: 3,
          perception: 3,
          hitPoints: 15,
          arkanaRole: 'admin',
          registrationCompleted: true
        }
      });

      const fakeUserId = '550e8400-e29b-41d4-a716-446655440999';
      const request = createMockGetRequest(
        `/api/arkana/admin/user/${fakeUserId}?token=${adminToken}`
      );

      const params = Promise.resolve({ userId: fakeUserId });
      const response = await GET(request, { params });
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(data.error).toContain('User not found');
    });
  });

  describe('PUT', () => {
    it('should update user stats and arkana data', async () => {
      const { user: adminUser, token: adminToken } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: adminUser.id,
          characterName: 'Admin',
          agentName: 'Admin',
          race: 'Human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 3,
          mental: 3,
          perception: 3,
          hitPoints: 15,
          arkanaRole: 'admin',
          registrationCompleted: true
        }
      });

      const { user: targetUser } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: targetUser.id,
          characterName: 'Original Name',
          agentName: 'Original Agent',
          race: 'Human',
          archetype: 'Synthral',
          physical: 2,
          dexterity: 2,
          mental: 2,
          perception: 2,
          hitPoints: 10,
          credits: 100,
          registrationCompleted: true
        }
      });

      await prisma.userStats.create({
        data: {
          userId: targetUser.id,
          health: 10,
          status: 0
        }
      });

      const updateData = {
        token: adminToken,
        characterName: 'Updated Name',
        physical: 5,
        hitPoints: 25,
        health: 20,
        credits: 1000,
        chips: 500,
        commonPowers: ['New Power 1', 'New Power 2'],
        arkanaRole: 'admin'
      };

      const request = createMockPutRequest(
        `/api/arkana/admin/user/${targetUser.id}`,
        updateData
      );

      const params = Promise.resolve({ userId: targetUser.id });
      const response = await PUT(request, { params });
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.arkanaStats.characterName).toBe('Updated Name');
      expect(data.data.arkanaStats.physical).toBe(5);
      expect(data.data.arkanaStats.hitPoints).toBe(25);
      expect(data.data.arkanaStats.credits).toBe(1000);
      expect(data.data.arkanaStats.chips).toBe(500);
      expect(data.data.arkanaStats.arkanaRole).toBe('admin');
      expect(data.data.stats.health).toBe(20);
    });

    it('should validate health does not exceed max health', async () => {
      const { user: adminUser, token: adminToken } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: adminUser.id,
          characterName: 'Admin',
          agentName: 'Admin',
          race: 'Human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 3,
          mental: 3,
          perception: 3,
          hitPoints: 15,
          arkanaRole: 'admin',
          registrationCompleted: true
        }
      });

      const { user: targetUser } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: targetUser.id,
          characterName: 'Test',
          agentName: 'Test',
          race: 'Human',
          archetype: 'Synthral',
          physical: 2,
          dexterity: 2,
          mental: 2,
          perception: 2,
          hitPoints: 10,
          registrationCompleted: true
        }
      });

      await prisma.userStats.create({
        data: {
          userId: targetUser.id,
          health: 10,
          status: 0
        }
      });

      const updateData = {
        token: adminToken,
        health: 50, // Greater than hitPoints (10)
        hitPoints: 10
      };

      const request = createMockPutRequest(
        `/api/arkana/admin/user/${targetUser.id}`,
        updateData
      );

      const params = Promise.resolve({ userId: targetUser.id });
      const response = await PUT(request, { params });
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(data.error).toContain('Current health cannot exceed maximum health');
    });

    it('should allow admin to update max health and current health together', async () => {
      const { user: adminUser, token: adminToken } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: adminUser.id,
          characterName: 'Admin',
          agentName: 'Admin',
          race: 'Human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 3,
          mental: 3,
          perception: 3,
          hitPoints: 15,
          arkanaRole: 'admin',
          registrationCompleted: true
        }
      });

      const { user: targetUser } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: targetUser.id,
          characterName: 'Test',
          agentName: 'Test',
          race: 'Human',
          archetype: 'Synthral',
          physical: 2,
          dexterity: 2,
          mental: 2,
          perception: 2,
          hitPoints: 10,
          registrationCompleted: true
        }
      });

      await prisma.userStats.create({
        data: {
          userId: targetUser.id,
          health: 5,
          status: 0
        }
      });

      const updateData = {
        token: adminToken,
        hitPoints: 50, // Increase max health
        health: 50 // Set current health to new max
      };

      const request = createMockPutRequest(
        `/api/arkana/admin/user/${targetUser.id}`,
        updateData
      );

      const params = Promise.resolve({ userId: targetUser.id });
      const response = await PUT(request, { params });
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.arkanaStats.hitPoints).toBe(50);
      expect(data.data.stats.health).toBe(50);
    });

    it('should allow updating powers and abilities', async () => {
      const { user: adminUser, token: adminToken } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: adminUser.id,
          characterName: 'Admin',
          agentName: 'Admin',
          race: 'Human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 3,
          mental: 3,
          perception: 3,
          hitPoints: 15,
          arkanaRole: 'admin',
          registrationCompleted: true
        }
      });

      const { user: targetUser } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: targetUser.id,
          characterName: 'Test',
          agentName: 'Test',
          race: 'Human',
          archetype: 'Synthral',
          physical: 2,
          dexterity: 2,
          mental: 2,
          perception: 2,
          hitPoints: 10,
          commonPowers: [],
          registrationCompleted: true
        }
      });

      const updateData = {
        token: adminToken,
        commonPowers: ['Power A', 'Power B', 'Power C'],
        archetypePowers: ['Arch Power 1'],
        perks: ['Perk 1', 'Perk 2'],
        magicSchools: ['Fire Magic', 'Ice Magic'],
        cyberneticAugments: ['Cyber Eye', 'Cyber Arm']
      };

      const request = createMockPutRequest(
        `/api/arkana/admin/user/${targetUser.id}`,
        updateData
      );

      const params = Promise.resolve({ userId: targetUser.id });
      const response = await PUT(request, { params });
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.arkanaStats.commonPowers).toEqual(['Power A', 'Power B', 'Power C']);
      expect(data.data.arkanaStats.archetypePowers).toEqual(['Arch Power 1']);
      expect(data.data.arkanaStats.perks).toEqual(['Perk 1', 'Perk 2']);
      expect(data.data.arkanaStats.magicSchools).toEqual(['Fire Magic', 'Ice Magic']);
      expect(data.data.arkanaStats.cyberneticAugments).toEqual(['Cyber Eye', 'Cyber Arm']);
    });

    it('should deny access for non-admin', async () => {
      const { user: regularUser, token: regularToken } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: regularUser.id,
          characterName: 'Regular',
          agentName: 'Regular',
          race: 'Human',
          archetype: 'Synthral',
          physical: 2,
          dexterity: 2,
          mental: 2,
          perception: 2,
          hitPoints: 10,
          arkanaRole: 'player',
          registrationCompleted: true
        }
      });

      const { user: targetUser } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: targetUser.id,
          characterName: 'Target',
          agentName: 'Target',
          race: 'Human',
          archetype: 'Arcanist',
          physical: 2,
          dexterity: 2,
          mental: 2,
          perception: 2,
          hitPoints: 10,
          registrationCompleted: true
        }
      });

      const updateData = {
        token: regularToken,
        characterName: 'Hacked Name'
      };

      const request = createMockPutRequest(
        `/api/arkana/admin/user/${targetUser.id}`,
        updateData
      );

      const params = Promise.resolve({ userId: targetUser.id });
      const response = await PUT(request, { params });
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(data.error).toContain('Access denied');
    });

    it('should create userStats if it does not exist', async () => {
      const { user: adminUser, token: adminToken } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: adminUser.id,
          characterName: 'Admin',
          agentName: 'Admin',
          race: 'Human',
          archetype: 'Arcanist',
          physical: 3,
          dexterity: 3,
          mental: 3,
          perception: 3,
          hitPoints: 15,
          arkanaRole: 'admin',
          registrationCompleted: true
        }
      });

      const { user: targetUser } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: targetUser.id,
          characterName: 'Test',
          agentName: 'Test',
          race: 'Human',
          archetype: 'Synthral',
          physical: 2,
          dexterity: 2,
          mental: 2,
          perception: 2,
          hitPoints: 10,
          registrationCompleted: true
        }
      });

      // Don't create userStats

      const updateData = {
        token: adminToken,
        health: 8,
        status: 1
      };

      const request = createMockPutRequest(
        `/api/arkana/admin/user/${targetUser.id}`,
        updateData
      );

      const params = Promise.resolve({ userId: targetUser.id });
      const response = await PUT(request, { params });
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.stats.health).toBe(8);
      expect(data.data.stats.status).toBe(1);
    });
  });
});
