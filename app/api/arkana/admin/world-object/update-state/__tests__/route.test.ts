import { POST } from '../route';
import {
  createMockPostRequest,
  cleanupDatabase,
  expectSuccess,
  expectError,
  parseJsonResponse,
  createTestUser
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { prisma } from '@/lib/prisma';

describe('POST /api/arkana/admin/world-object/update-state', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('should update object state successfully for admin', async () => {
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
        hitPoints: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    // Create world object
    await prisma.worldObject.create({
      data: {
        objectId: 'DOOR_001',
        universe: 'arkana',
        name: 'Test Door',
        type: 'door',
        state: 'Locked',
        actions: [
          {
            action: 'Unlock',
            showStates: 'Locked',
            successState: 'Closed'
          }
        ]
      }
    });

    const request = createMockPostRequest(
      '/api/arkana/admin/world-object/update-state',
      {
        token: adminToken,
        objectId: 'DOOR_001',
        state: 'Open'
      }
    );

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.objectId).toBe('DOOR_001');
    expect(data.data.state).toBe('Open');

    // Verify database was updated
    const updated = await prisma.worldObject.findUnique({
      where: {
        objectId_universe: {
          objectId: 'DOOR_001',
          universe: 'arkana'
        }
      }
    });
    expect(updated?.state).toBe('Open');
  });

  it('should return 404 for non-existent object', async () => {
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
        hitPoints: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    const request = createMockPostRequest(
      '/api/arkana/admin/world-object/update-state',
      {
        token: adminToken,
        objectId: 'NONEXISTENT',
        state: 'Open'
      }
    );

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(404);
    expect(data.error).toContain('World object not found');
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
        hitPoints: 10,
        arkanaRole: 'player', // Not admin
        registrationCompleted: true
      }
    });

    // Create world object
    await prisma.worldObject.create({
      data: {
        objectId: 'DOOR_001',
        universe: 'arkana',
        name: 'Test Door',
        type: 'door',
        state: 'Locked',
        actions: [
          {
            action: 'Unlock',
            showStates: 'Locked',
            successState: 'Closed'
          }
        ]
      }
    });

    const request = createMockPostRequest(
      '/api/arkana/admin/world-object/update-state',
      {
        token: token,
        objectId: 'DOOR_001',
        state: 'Open'
      }
    );

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(403);
    expect(data.error).toContain('Access denied');
  });

  it('should reject missing required fields', async () => {
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
        hitPoints: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    // Missing state
    const request = createMockPostRequest(
      '/api/arkana/admin/world-object/update-state',
      {
        token: adminToken,
        objectId: 'DOOR_001'
        // Missing state field
      }
    );

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
  });

  it('should update updatedAt timestamp', async () => {
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
        hitPoints: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    // Create world object with old timestamp
    const oldObject = await prisma.worldObject.create({
      data: {
        objectId: 'DOOR_001',
        universe: 'arkana',
        name: 'Test Door',
        type: 'door',
        state: 'Locked',
        actions: [
          {
            action: 'Unlock',
            showStates: 'Locked',
            successState: 'Closed'
          }
        ],
        updatedAt: new Date('2024-01-01')
      }
    });

    const request = createMockPostRequest(
      '/api/arkana/admin/world-object/update-state',
      {
        token: adminToken,
        objectId: 'DOOR_001',
        state: 'Open'
      }
    );

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);

    // Verify updatedAt was changed
    const updated = await prisma.worldObject.findUnique({
      where: {
        objectId_universe: {
          objectId: 'DOOR_001',
          universe: 'arkana'
        }
      }
    });
    expect(updated?.updatedAt.getTime()).toBeGreaterThan(oldObject.updatedAt.getTime());
  });

  it('should only work with Arkana universe objects', async () => {
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
        hitPoints: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
      }
    });

    // Create object in different universe
    await prisma.worldObject.create({
      data: {
        objectId: 'OTHER_OBJ',
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

    const request = createMockPostRequest(
      '/api/arkana/admin/world-object/update-state',
      {
        token: adminToken,
        objectId: 'OTHER_OBJ',
        state: 'Open'
      }
    );

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(404);
    expect(data.error).toContain('World object not found');
  });

  it('should return updated object data in response', async () => {
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
        hitPoints: 15,
        arkanaRole: 'admin',
        registrationCompleted: true
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

    const request = createMockPostRequest(
      '/api/arkana/admin/world-object/update-state',
      {
        token: adminToken,
        objectId: 'LEVER_001',
        state: 'On'
      }
    );

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data).toHaveProperty('objectId', 'LEVER_001');
    expect(data.data).toHaveProperty('name', 'Power Lever');
    expect(data.data).toHaveProperty('state', 'On');
    expect(data.data).toHaveProperty('type', 'lever');
    expect(data.data).toHaveProperty('updatedAt');
  });
});
