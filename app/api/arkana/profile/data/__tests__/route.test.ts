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

describe('GET /api/arkana/profile/data', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('should return Arkana profile data with stats', async () => {
    // Create test user with Arkana character
    const { user, token } = await createTestUser('arkana');

    // Create arkana stats
    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Cyber Warrior',
        agentName: 'TestAgent',
        race: 'Human',
        archetype: 'Synthral',
        physical: 3,
        dexterity: 4,
        mental: 2,
        perception: 3,
        hitPoints: 15,
        credits: 100,
        chips: 50,
        xp: 0,
        arkanaRole: 'player',
        registrationCompleted: true
      }
    });

    // Create user stats with current health
    await prisma.userStats.create({
      data: {
        userId: user.id,
        health: 10,
        status: 0,
        hunger: 100,
        thirst: 100
      }
    });

    const sessionId = 'test-session-' + Date.now();
    const request = createMockGetRequest(
      `/api/arkana/profile/data?sl_uuid=${user.slUuid}&universe=arkana&token=${token}&sessionId=${sessionId}&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.user.slUuid).toBe(user.slUuid);
    expect(data.data.arkanaStats.characterName).toBe('Cyber Warrior');
    expect(data.data.arkanaStats.hitPoints).toBe(15); // Max health
    expect(data.data.stats.health).toBe(10); // Current health
    expect(data.data.arkanaStats.credits).toBe(100);
    expect(data.data.arkanaStats.arkanaRole).toBe('player');
  });

  it('should return admin role for admin users', async () => {
    const { user, token } = await createTestUser('arkana');

    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Admin Character',
        agentName: 'AdminAgent',
        race: 'Human',
        archetype: 'Arcanist',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 15,
        arkanaRole: 'admin', // Admin role
        registrationCompleted: true
      }
    });

    await prisma.userStats.create({
      data: {
        userId: user.id,
        health: 15,
        status: 0
      }
    });

    const sessionId = 'test-session-' + Date.now();
    const request = createMockGetRequest(
      `/api/arkana/profile/data?sl_uuid=${user.slUuid}&universe=arkana&token=${token}&sessionId=${sessionId}&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.arkanaStats.arkanaRole).toBe('admin');
  });

  it('should fail without session ID', async () => {
    const { user, token } = await createTestUser('arkana');

    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Test',
        agentName: 'Test',
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
      `/api/arkana/profile/data?sl_uuid=${user.slUuid}&universe=arkana&token=${token}&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(data.error).toContain('Session ID');
  });

  it('should fail with invalid token', async () => {
    const request = createMockGetRequest(
      `/api/arkana/profile/data?sl_uuid=550e8400-e29b-41d4-a716-446655440000&universe=arkana&token=invalid_token&sessionId=test&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectError(data);
  });

  it('should fail for non-arkana universe', async () => {
    const { user, token } = await createTestUser('Gor');

    const sessionId = 'test-session-' + Date.now();
    const request = createMockGetRequest(
      `/api/arkana/profile/data?sl_uuid=${user.slUuid}&universe=Gor&token=${token}&sessionId=${sessionId}&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectError(data);
  });

  it('should return paginated events', async () => {
    const { user, token } = await createTestUser('arkana');

    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Test',
        agentName: 'Test',
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

    await prisma.userStats.create({
      data: {
        userId: user.id,
        health: 10,
        status: 0
      }
    });

    // Create test events
    for (let i = 0; i < 5; i++) {
      await prisma.event.create({
        data: {
          userId: user.id,
          type: 'test_event',
          details: { action: `test_${i}` }
        }
      });
    }

    const sessionId = 'test-session-' + Date.now();
    const request = createMockGetRequest(
      `/api/arkana/profile/data?sl_uuid=${user.slUuid}&universe=arkana&token=${token}&sessionId=${sessionId}&page=1&limit=5`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.events.data.length).toBe(5);
    expect(data.data.events.pagination.totalEvents).toBe(5);
    expect(data.data.events.pagination.totalPages).toBe(1);
  });

  it('should fail if user has no Arkana character', async () => {
    const { user, token } = await createTestUser('arkana');

    // Don't create arkanaStats - user exists but has no character

    const sessionId = 'test-session-' + Date.now();
    const request = createMockGetRequest(
      `/api/arkana/profile/data?sl_uuid=${user.slUuid}&universe=arkana&token=${token}&sessionId=${sessionId}&page=1&limit=20`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(data.error).toContain('Arkana character not found');
  });
});
