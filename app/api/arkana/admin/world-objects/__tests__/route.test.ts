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

describe('GET /api/arkana/admin/world-objects', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('should return list of Arkana world objects for admin', async () => {
    // Create admin user
    const { user: adminUser, token: adminToken } = await createTestUser('arkana');
    await prisma.arkanaStats.create({
      data: {
        userId: adminUser.id,
        characterName: 'Admin',
        agentName: 'Admin',
        race: 'human',
        archetype: 'arcanist',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        maxHP: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    // Create test world objects
    for (let i = 1; i <= 3; i++) {
      await prisma.worldObject.create({
        data: {
          objectId: `DOOR_TEST_${i}`,
          universe: 'arkana',
          name: `Test Door ${i}`,
          type: 'door',
          state: 'Locked',
          description: `Test door number ${i}`,
          location: `Test Location ${i}`,
          actions: [
            {
              action: 'Unlock',
              showStates: 'Locked',
              successState: 'Closed'
            }
          ]
        }
      });
    }

    const request = createMockGetRequest(
      `/api/arkana/admin/world-objects?token=${adminToken}&search=&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.objects).toHaveLength(3);
    expect(data.data.pagination.totalObjects).toBe(3);

    // Check that objects have required fields
    const firstObject = data.data.objects[0];
    expect(firstObject).toHaveProperty('id');
    expect(firstObject).toHaveProperty('objectId');
    expect(firstObject).toHaveProperty('name');
    expect(firstObject).toHaveProperty('type');
    expect(firstObject).toHaveProperty('state');
  });

  it('should search by object ID', async () => {
    const { user: adminUser, token: adminToken } = await createTestUser('arkana');
    await prisma.arkanaStats.create({
      data: {
        userId: adminUser.id,
        characterName: 'Admin',
        agentName: 'Admin',
        race: 'human',
        archetype: 'arcanist',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        maxHP: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    // Create specific object
    await prisma.worldObject.create({
      data: {
        objectId: 'VAULT_DOOR_001',
        universe: 'arkana',
        name: 'Secure Vault Door',
        type: 'door',
        state: 'Locked',
        actions: [
          {
            action: 'Hack',
            showStates: 'Locked',
            successState: 'Hacked'
          }
        ]
      }
    });

    await prisma.worldObject.create({
      data: {
        objectId: 'LEVER_001',
        universe: 'arkana',
        name: 'Power Lever',
        type: 'lever',
        state: 'Off',
        actions: [
          {
            action: 'Flip',
            showStates: 'Off',
            successState: 'On'
          }
        ]
      }
    });

    const request = createMockGetRequest(
      `/api/arkana/admin/world-objects?token=${adminToken}&search=VAULT&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.objects).toHaveLength(1);
    expect(data.data.objects[0].objectId).toBe('VAULT_DOOR_001');
  });

  it('should search by object name', async () => {
    const { user: adminUser, token: adminToken } = await createTestUser('arkana');
    await prisma.arkanaStats.create({
      data: {
        userId: adminUser.id,
        characterName: 'Admin',
        agentName: 'Admin',
        race: 'human',
        archetype: 'arcanist',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        maxHP: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    await prisma.worldObject.create({
      data: {
        objectId: 'DOOR_001',
        universe: 'arkana',
        name: 'Cyberpunk Terminal',
        type: 'terminal',
        state: 'Active',
        actions: [
          {
            action: 'Hack',
            showStates: 'Active',
            successState: 'Hacked'
          }
        ]
      }
    });

    await prisma.worldObject.create({
      data: {
        objectId: 'DOOR_002',
        universe: 'arkana',
        name: 'Simple Door',
        type: 'door',
        state: 'Closed',
        actions: [
          {
            action: 'Open',
            showStates: 'Closed',
            successState: 'Open'
          }
        ]
      }
    });

    const request = createMockGetRequest(
      `/api/arkana/admin/world-objects?token=${adminToken}&search=Cyberpunk&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.objects).toHaveLength(1);
    expect(data.data.objects[0].name).toBe('Cyberpunk Terminal');
  });

  it('should paginate results', async () => {
    const { user: adminUser, token: adminToken } = await createTestUser('arkana');
    await prisma.arkanaStats.create({
      data: {
        userId: adminUser.id,
        characterName: 'Admin',
        agentName: 'Admin',
        race: 'human',
        archetype: 'arcanist',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        maxHP: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    // Create 6 test objects
    for (let i = 1; i <= 6; i++) {
      await prisma.worldObject.create({
        data: {
          objectId: `OBJ_${i}`,
          universe: 'arkana',
          name: `Object ${i}`,
          type: 'misc',
          state: 'default',
          actions: [
            {
              action: 'Use',
              showStates: 'default',
              successState: 'used'
            }
          ]
        }
      });
    }

    const request = createMockGetRequest(
      `/api/arkana/admin/world-objects?token=${adminToken}&search=&page=1&limit=5`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.objects).toHaveLength(5);
    expect(data.data.pagination.totalPages).toBe(2); // 6 total objects / 5 per page = 2 pages
    expect(data.data.pagination.hasNextPage).toBe(true);
  });

  it('should deny access for non-admin user', async () => {
    const { user, token } = await createTestUser('arkana');
    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Player',
        agentName: 'Player',
        race: 'human',
        archetype: 'synthral',
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
      `/api/arkana/admin/world-objects?token=${token}&search=&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(data.error).toContain('Access denied');
  });

  it('should only return Arkana universe objects', async () => {
    const { user: adminUser, token: adminToken } = await createTestUser('arkana');
    await prisma.arkanaStats.create({
      data: {
        userId: adminUser.id,
        characterName: 'Admin',
        agentName: 'Admin',
        race: 'human',
        archetype: 'arcanist',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        maxHP: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    // Create Arkana object
    await prisma.worldObject.create({
      data: {
        objectId: 'ARKANA_OBJ_001',
        universe: 'arkana',
        name: 'Arkana Object',
        type: 'door',
        state: 'Closed',
        actions: [
          {
            action: 'Open',
            showStates: 'Closed',
            successState: 'Open'
          }
        ]
      }
    });

    // Create object from different universe (should not appear)
    await prisma.worldObject.create({
      data: {
        objectId: 'OTHER_OBJ_001',
        universe: 'other',
        name: 'Other Object',
        type: 'door',
        state: 'Closed',
        actions: [
          {
            action: 'Open',
            showStates: 'Closed',
            successState: 'Open'
          }
        ]
      }
    });

    const request = createMockGetRequest(
      `/api/arkana/admin/world-objects?token=${adminToken}&search=&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.objects).toHaveLength(1);
    expect(data.data.objects[0].objectId).toBe('ARKANA_OBJ_001');
  });

  it('should return empty results for non-matching search', async () => {
    const { user: adminUser, token: adminToken } = await createTestUser('arkana');
    await prisma.arkanaStats.create({
      data: {
        userId: adminUser.id,
        characterName: 'Admin',
        agentName: 'Admin',
        race: 'human',
        archetype: 'arcanist',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        maxHP: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    await prisma.worldObject.create({
      data: {
        objectId: 'DOOR_001',
        universe: 'arkana',
        name: 'Test Door',
        type: 'door',
        state: 'Closed',
        actions: [
          {
            action: 'Open',
            showStates: 'Closed',
            successState: 'Open'
          }
        ]
      }
    });

    const request = createMockGetRequest(
      `/api/arkana/admin/world-objects?token=${adminToken}&search=NONEXISTENT&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.objects).toHaveLength(0);
    expect(data.data.pagination.totalObjects).toBe(0);
  });

  it('should reject missing token', async () => {
    const request = createMockGetRequest(
      `/api/arkana/admin/world-objects?search=&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
  });

  it('should order by updatedAt descending', async () => {
    const { user: adminUser, token: adminToken } = await createTestUser('arkana');
    await prisma.arkanaStats.create({
      data: {
        userId: adminUser.id,
        characterName: 'Admin',
        agentName: 'Admin',
        race: 'human',
        archetype: 'arcanist',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        maxHP: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    // Create objects with different timestamps
    await prisma.worldObject.create({
      data: {
        objectId: 'OLD_OBJ',
        universe: 'arkana',
        name: 'Old Object',
        type: 'door',
        state: 'Closed',
        actions: [
          {
            action: 'Open',
            showStates: 'Closed',
            successState: 'Open'
          }
        ],
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
      }
    });

    // Wait a bit then create newer object
    await new Promise(resolve => setTimeout(resolve, 10));

    await prisma.worldObject.create({
      data: {
        objectId: 'NEW_OBJ',
        universe: 'arkana',
        name: 'New Object',
        type: 'door',
        state: 'Closed',
        actions: [
          {
            action: 'Open',
            showStates: 'Closed',
            successState: 'Open'
          }
        ]
      }
    });

    const request = createMockGetRequest(
      `/api/arkana/admin/world-objects?token=${adminToken}&search=&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.objects).toHaveLength(2);
    // Most recently updated should be first
    expect(data.data.objects[0].objectId).toBe('NEW_OBJ');
  });
});
