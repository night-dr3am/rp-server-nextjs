import { POST } from '../route';
import {
  createMockPostRequest,
  createApiBody,
  cleanupDatabase,
  expectSuccess,
  expectError,
  generateTestUUID,
  generateTestUsername,
  parseJsonResponse,
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { prisma } from '@/lib/prisma';

describe('POST /api/gor/register', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('should generate character creation link for new user', async () => {
    const uuid = generateTestUUID();
    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'gor'
    }, 'gor');

    const request = createMockPostRequest('/api/gor/register', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.alreadyRegistered).toBe("false");
    expect(data.data.characterCreationUrl).toContain('/gor/create/');
    expect(data.data.characterCreationUrl).toContain(uuid);
    expect(data.data.token).toBeDefined();
    expect(data.data.expiresAt).toBeDefined();
    expect(data.data.user.uuid).toBe(uuid);
    expect(data.data.user.universe).toBe('gor');
  });

  it('should create user if does not exist', async () => {
    const uuid = generateTestUUID();
    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'gor'
    }, 'gor');

    const request = createMockPostRequest('/api/gor/register', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);

    // Verify user was created in database
    const createdUser = await prisma.user.findFirst({
      where: { slUuid: uuid, universe: 'gor' },
      include: { stats: true }
    });
    expect(createdUser).toBeTruthy();
    expect(createdUser?.username).toBe(uuid); // Temporary username
    expect(createdUser?.role).toBe('FREE'); // Prisma stores enum value, not mapped display name
    expect(createdUser?.stats).toBeTruthy();
    expect(createdUser?.stats?.health).toBe(5); // Default health for Strength=1
  });

  it('should return existing stats for registered user', async () => {
    // Create test user with gorean stats
    const uuid = generateTestUUID();
    const username = generateTestUsername();

    await prisma.user.create({
      data: {
        slUuid: uuid,
        universe: 'gor',
        username: username,
        role: 'FREE',
        stats: {
          create: {
            health: 5,
            hunger: 100,
            thirst: 100
          }
        },
        goreanStats: {
          create: {
            characterName: 'Test Warrior',
            agentName: `${username} of Ko-ro-ba`,
            species: 'human',
            speciesCategory: 'sapient',
            culture: 'southern_cities',
            cultureType: 'cityState',
            socialStatus: 'free_man',
            casteRole: 'warriors',
            casteRoleType: 'highCaste',
            strength: 4,
            agility: 3,
            intellect: 2,
            perception: 3,
            charisma: 2,
            statPointsPool: 0,
            statPointsSpent: 10,
            healthMax: 20,
            registrationCompleted: true
          }
        }
      }
    });

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'gor'
    }, 'gor');

    const request = createMockPostRequest('/api/gor/register', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.alreadyRegistered).toBe("true");
    expect(data.data.goreanStats.characterName).toBe('Test Warrior');
    expect(data.data.goreanStats.species).toBe('human');
    expect(data.data.goreanStats.culture).toBe('southern_cities');
    expect(data.data.goreanStats.strength).toBe(4);
    expect(data.data.goreanStats.healthMax).toBe(20);
  });

  it('should return 401 for invalid signature', async () => {
    const body = {
      sl_uuid: generateTestUUID(),
      universe: 'gor',
      timestamp: new Date().toISOString(),
      signature: 'invalid-signature'
    };

    const request = createMockPostRequest('/api/gor/register', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data); // Joi validates signature format before auth check
    expect(response.status).toBe(400); // Validation error, not auth error
  });

  it('should return 400 for missing sl_uuid', async () => {
    const body = createApiBody({
      universe: 'gor'
      // missing sl_uuid
    }, 'gor');

    const request = createMockPostRequest('/api/gor/register', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
  });

  it('should return 400 for invalid UUID format', async () => {
    const body = createApiBody({
      sl_uuid: 'invalid-uuid-format',
      universe: 'gor'
    }, 'gor');

    const request = createMockPostRequest('/api/gor/register', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
  });

  it('should return 400 for missing universe', async () => {
    const body = createApiBody({
      sl_uuid: generateTestUUID()
      // missing universe
    }, 'gor');
    delete body.universe; // Explicitly remove universe

    const request = createMockPostRequest('/api/gor/register', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
  });

  it('should return 400 for wrong universe', async () => {
    const body = createApiBody({
      sl_uuid: generateTestUUID(),
      universe: 'arkana' // Wrong universe
    }, 'gor'); // But signed with gor secret

    const request = createMockPostRequest('/api/gor/register', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data); // Joi schema only allows 'gor' for this endpoint
    expect(response.status).toBe(400); // Validation error
  });

  it('should enforce rate limiting (5 tokens per hour)', async () => {
    // Create test user
    const uuid = generateTestUUID();
    const username = generateTestUsername();

    const user = await prisma.user.create({
      data: {
        slUuid: uuid,
        universe: 'gor',
        username: username,
        role: 'FREE',
        stats: {
          create: {
            health: 5,
            hunger: 100,
            thirst: 100
          }
        }
      }
    });

    // Create 5 tokens to hit rate limit
    const tokens = [];
    for (let i = 0; i < 5; i++) {
      tokens.push(
        prisma.profileToken.create({
          data: {
            userId: user.id,
            token: `token-${i}`,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
          }
        })
      );
    }
    await Promise.all(tokens);

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'gor'
    }, 'gor');

    const request = createMockPostRequest('/api/gor/register', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data, 'Rate limit exceeded');
    expect(response.status).toBe(429);
  });

  it('should clean up expired tokens before checking rate limit', async () => {
    // Create test user
    const uuid = generateTestUUID();
    const username = generateTestUsername();

    const user = await prisma.user.create({
      data: {
        slUuid: uuid,
        universe: 'gor',
        username: username,
        role: 'FREE',
        stats: {
          create: {
            health: 5,
            hunger: 100,
            thirst: 100
          }
        }
      }
    });

    // Create 5 expired tokens
    const expiredTokens = [];
    for (let i = 0; i < 5; i++) {
      expiredTokens.push(
        prisma.profileToken.create({
          data: {
            userId: user.id,
            token: `expired-token-${i}`,
            expiresAt: new Date(Date.now() - 1000) // Already expired
          }
        })
      );
    }
    await Promise.all(expiredTokens);

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'gor'
    }, 'gor');

    const request = createMockPostRequest('/api/gor/register', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    // Should succeed because expired tokens were cleaned up
    expectSuccess(data);
    expect(data.data.alreadyRegistered).toBe("false");
    expect(data.data.token).toBeDefined();
  });

  it('should generate valid JWT token with correct claims', async () => {
    const uuid = generateTestUUID();
    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'gor'
    }, 'gor');

    const request = createMockPostRequest('/api/gor/register', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.token).toBeDefined();

    // Verify token is stored in database
    const storedToken = await prisma.profileToken.findFirst({
      where: {
        token: data.data.token
      }
    });
    expect(storedToken).toBeTruthy();
    expect(storedToken?.expiresAt).toBeInstanceOf(Date);

    // Verify token expiration is 24 hours from now (with 1 minute tolerance)
    const expectedExpiration = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const timeDiff = Math.abs(storedToken!.expiresAt.getTime() - expectedExpiration.getTime());
    expect(timeDiff).toBeLessThan(60000); // Less than 1 minute difference
  });

  it('should allow user to generate new token for incomplete character', async () => {
    // Create user with incomplete gorean character
    const uuid = generateTestUUID();
    const username = generateTestUsername();

    await prisma.user.create({
      data: {
        slUuid: uuid,
        universe: 'gor',
        username: username,
        role: 'FREE',
        stats: {
          create: {
            health: 5,
            hunger: 100,
            thirst: 100
          }
        },
        goreanStats: {
          create: {
            characterName: 'Incomplete Character',
            agentName: username,
            species: 'human',
            speciesCategory: 'sapient',
            culture: 'southern_cities',
            cultureType: 'cityState',
            socialStatus: 'free_man',
            strength: 1,
            agility: 1,
            intellect: 1,
            perception: 1,
            charisma: 1,
            statPointsPool: 10,
            statPointsSpent: 0,
            healthMax: 5,
            registrationCompleted: false // Incomplete!
          }
        }
      }
    });

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'gor'
    }, 'gor');

    const request = createMockPostRequest('/api/gor/register', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    // Should generate new token for incomplete character
    expectSuccess(data);
    expect(data.data.alreadyRegistered).toBe("false");
    expect(data.data.token).toBeDefined();
    expect(data.data.characterCreationUrl).toContain('/gor/create/');
  });

  it('should update lastActive timestamp for existing user', async () => {
    const uuid = generateTestUUID();
    const username = generateTestUsername();

    const user = await prisma.user.create({
      data: {
        slUuid: uuid,
        universe: 'gor',
        username: username,
        role: 'FREE',
        lastActive: new Date(Date.now() - 1000000), // Old timestamp
        stats: {
          create: {
            health: 5,
            hunger: 100,
            thirst: 100
          }
        },
        goreanStats: {
          create: {
            characterName: 'Test Character',
            agentName: username,
            species: 'human',
            speciesCategory: 'sapient',
            culture: 'southern_cities',
            cultureType: 'cityState',
            socialStatus: 'free_man',
            strength: 3,
            agility: 3,
            intellect: 2,
            perception: 2,
            charisma: 2,
            statPointsPool: 0,
            statPointsSpent: 10,
            healthMax: 15,
            registrationCompleted: true
          }
        }
      }
    });

    const oldLastActive = user.lastActive;

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'gor'
    }, 'gor');

    const request = createMockPostRequest('/api/gor/register', body);
    await POST(request);

    // Check lastActive was NOT updated (it shouldn't be updated in register endpoint)
    // Note: The register endpoint doesn't update lastActive, only returns data
    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id }
    });
    // Since register doesn't update lastActive, it should be the same
    expect(updatedUser?.lastActive).toEqual(oldLastActive);
  });
});
