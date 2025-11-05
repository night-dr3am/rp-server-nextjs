import { GET } from '../route';
import {
  createMockGetRequest,
  cleanupDatabase,
  expectSuccess,
  expectError,
  parseJsonResponse,
  createTestUser
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { prisma } from '@/lib/prisma';

describe('GET /api/arkana/admin/users', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('should return list of Arkana users for admin', async () => {
    // Create admin user
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
        maxHP: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    // Create test players
    for (let i = 1; i <= 3; i++) {
      const { user } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: user.id,
          characterName: `Player ${i}`,
          agentName: `Agent${i}`,
          race: 'Human',
          archetype: 'Synthral',
          physical: 2,
          dexterity: 2,
          mental: 2,
          perception: 2,
          maxHP: 10,
          credits: 100 * i,
          registrationCompleted: true
        }
      });

      await prisma.userStats.create({
        data: {
          userId: user.id,
          health: 5 + i,
          status: 0
        }
      });
    }

    const request = createMockGetRequest(
      `/api/arkana/admin/users?token=${adminToken}&search=&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.users).toHaveLength(4); // 3 players + 1 admin
    expect(data.data.pagination.totalUsers).toBe(4);

    // Check that users have required fields
    const firstUser = data.data.users[0];
    expect(firstUser).toHaveProperty('id');
    expect(firstUser).toHaveProperty('characterName');
    expect(firstUser).toHaveProperty('currentHealth');
    expect(firstUser).toHaveProperty('maxHealth');
    expect(firstUser).toHaveProperty('arkanaRole');
  });

  it('should search by character name', async () => {
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
        maxHP: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    // Create specific character
    const { user } = await createTestUser('arkana');
    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Cyber Warrior',
        agentName: 'TestAgent',
        race: 'Human',
        archetype: 'Synthral',
        physical: 2,
        dexterity: 2,
        mental: 2,
        perception: 2,
        maxHP: 10,
        registrationCompleted: true
      }
    });

    const request = createMockGetRequest(
      `/api/arkana/admin/users?token=${adminToken}&search=Cyber&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.users).toHaveLength(1);
    expect(data.data.users[0].characterName).toBe('Cyber Warrior');
  });

  it('should search by agent name', async () => {
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
        maxHP: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    const { user } = await createTestUser('arkana');
    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Test Character',
        agentName: 'SpecialAgent007',
        race: 'Human',
        archetype: 'Synthral',
        physical: 2,
        dexterity: 2,
        mental: 2,
        perception: 2,
        maxHP: 10,
        registrationCompleted: true
      }
    });

    const request = createMockGetRequest(
      `/api/arkana/admin/users?token=${adminToken}&search=SpecialAgent&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.users).toHaveLength(1);
    expect(data.data.users[0].agentName).toBe('SpecialAgent007');
  });

  it('should search by UUID', async () => {
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
        maxHP: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    const { user } = await createTestUser('arkana');
    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Test',
        agentName: 'Test',
        race: 'Human',
        archetype: 'Synthral',
        physical: 2,
        dexterity: 2,
        mental: 2,
        perception: 2,
        maxHP: 10,
        registrationCompleted: true
      }
    });

    const searchUuid = user.slUuid.substring(0, 8);
    const request = createMockGetRequest(
      `/api/arkana/admin/users?token=${adminToken}&search=${searchUuid}&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.users.length).toBeGreaterThan(0);
  });

  it('should paginate results', async () => {
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
        maxHP: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    // Create 5 test users
    for (let i = 1; i <= 5; i++) {
      const { user } = await createTestUser('arkana');
      await prisma.arkanaStats.create({
        data: {
          userId: user.id,
          characterName: `Player ${i}`,
          agentName: `Agent${i}`,
          race: 'Human',
          archetype: 'Synthral',
          physical: 2,
          dexterity: 2,
          mental: 2,
          perception: 2,
          maxHP: 10,
          registrationCompleted: true
        }
      });
    }

    const request = createMockGetRequest(
      `/api/arkana/admin/users?token=${adminToken}&search=&page=1&limit=5`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.users).toHaveLength(5);
    expect(data.data.pagination.totalPages).toBe(2); // 6 total users / 5 per page = 2 pages
    expect(data.data.pagination.hasNextPage).toBe(true);
  });

  it('should deny access for non-admin user', async () => {
    const { user, token } = await createTestUser('arkana');
    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Player',
        agentName: 'Player',
        race: 'Human',
        archetype: 'Synthral',
        physical: 2,
        dexterity: 2,
        mental: 2,
        perception: 2,
        maxHP: 10,
        arkanaRole: 'player', // Not admin
        registrationCompleted: true
      }
    });

    const request = createMockGetRequest(
      `/api/arkana/admin/users?token=${token}&search=&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(data.error).toContain('Access denied');
  });

  it('should show health data correctly', async () => {
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
        maxHP: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    const { user } = await createTestUser('arkana');
    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Test',
        agentName: 'Test',
        race: 'Human',
        archetype: 'Synthral',
        physical: 4, // 4 * 5 = 20 max HP
        dexterity: 2,
        mental: 2,
        perception: 2,
        maxHP: 20,
        registrationCompleted: true
      }
    });

    await prisma.userStats.create({
      data: {
        userId: user.id,
        health: 10, // Current health
        status: 1 // Injured
      }
    });

    const request = createMockGetRequest(
      `/api/arkana/admin/users?token=${adminToken}&search=&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    const testUser = data.data.users.find((u: { characterName: string }) => u.characterName === 'Test');
    expect(testUser.currentHealth).toBe(10);
    expect(testUser.maxHealth).toBe(20);
    expect(testUser.status).toBe(1);
  });
});
