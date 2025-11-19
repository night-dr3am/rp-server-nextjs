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

describe('POST /api/gor/check-user', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('should return false for non-existent user', async () => {
    const uuid = generateTestUUID();
    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'gor'
    }, 'gor');

    const request = createMockPostRequest('/api/gor/check-user', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.exists).toBe(false);
    expect(data.data.message).toContain('not found');
  });

  it('should return true for existing user without character', async () => {
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
        }
      }
    });

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'gor'
    }, 'gor');

    const request = createMockPostRequest('/api/gor/check-user', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.exists).toBe(true);
    expect(data.data.characterCompleted).toBe(false);
    expect(data.data.user.username).toBe(username);
    expect(data.data.user.uuid).toBe(uuid);
    expect(data.data.goreanStats).toBeNull();
  });

  it('should return true with character data for completed character', async () => {
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
            health: 15,
            hunger: 100,
            thirst: 100
          }
        },
        goreanStats: {
          create: {
            characterName: 'Tarl of Ko-ro-ba',
            agentName: 'Tarl, Warrior of the Scarlet Caste',
            species: 'human',
            speciesCategory: 'sapient',
            culture: 'southern_cities',
            cultureType: 'cityState',
            socialStatus: 'free_man',
            casteRole: 'warriors',
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

    const request = createMockPostRequest('/api/gor/check-user', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.exists).toBe(true);
    expect(data.data.characterCompleted).toBe(true);
    expect(data.data.user.username).toBe(username);
    expect(data.data.goreanStats).toBeDefined();
    expect(data.data.goreanStats.characterName).toBe('Tarl of Ko-ro-ba');
    expect(data.data.goreanStats.species).toBe('human');
    expect(data.data.goreanStats.culture).toBe('southern_cities');
    expect(data.data.goreanStats.socialStatus).toBe('free_man');
    expect(data.data.goreanStats.registrationCompleted).toBe(true);
  });

  it('should return false for incomplete character', async () => {
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
            registrationCompleted: false
          }
        }
      }
    });

    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'gor'
    }, 'gor');

    const request = createMockPostRequest('/api/gor/check-user', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.exists).toBe(true);
    expect(data.data.characterCompleted).toBe(false);
    expect(data.data.goreanStats).toBeNull(); // Should be null for incomplete characters
  });

  it('should return 401 for invalid signature', async () => {
    const body = {
      sl_uuid: generateTestUUID(),
      universe: 'gor',
      timestamp: new Date().toISOString(),
      signature: 'invalid-signature-here'
    };

    const request = createMockPostRequest('/api/gor/check-user', body);
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

    const request = createMockPostRequest('/api/gor/check-user', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
  });

  it('should return 400 for invalid UUID format', async () => {
    const body = createApiBody({
      sl_uuid: 'not-a-valid-uuid',
      universe: 'gor'
    }, 'gor');

    const request = createMockPostRequest('/api/gor/check-user', body);
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
    delete body.universe;

    const request = createMockPostRequest('/api/gor/check-user', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
  });

  it('should update lastActive timestamp when checking user', async () => {
    const uuid = generateTestUUID();
    const username = generateTestUsername();

    const user = await prisma.user.create({
      data: {
        slUuid: uuid,
        universe: 'gor',
        username: username,
        role: 'FREE',
        lastActive: new Date(Date.now() - 1000000), // 1000 seconds ago
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

    const request = createMockPostRequest('/api/gor/check-user', body);
    await POST(request);

    // Check lastActive was updated
    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id }
    });
    expect(updatedUser?.lastActive).not.toEqual(oldLastActive);
    expect(updatedUser?.lastActive.getTime()).toBeGreaterThan(oldLastActive.getTime());
  });

  it('should work for different Gorean species', async () => {
    const testCases = [
      { species: 'human', speciesCategory: 'sapient' },
      { species: 'larl', speciesCategory: 'feline' },
      { species: 'tarn', speciesCategory: 'avian' },
      { species: 'kaiila', speciesCategory: 'hooved' },
      { species: 'kurii', speciesCategory: 'sapient' }
    ];

    for (const testCase of testCases) {
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
              health: 10,
              hunger: 100,
              thirst: 100
            }
          },
          goreanStats: {
            create: {
              characterName: `Test ${testCase.species}`,
              agentName: username,
              species: testCase.species,
              speciesCategory: testCase.speciesCategory,
              culture: testCase.speciesCategory === 'sapient' ? 'southern_cities' : 'wild',
              cultureType: testCase.speciesCategory === 'sapient' ? 'cityState' : 'animal',
              socialStatus: testCase.speciesCategory === 'sapient' ? 'free_man' : 'wild',
              strength: 3,
              agility: 3,
              intellect: 2,
              perception: 3,
              charisma: 2,
              statPointsPool: 0,
              statPointsSpent: 10,
              healthMax: 15,
              registrationCompleted: true
            }
          }
        }
      });

      const body = createApiBody({
        sl_uuid: uuid,
        universe: 'gor'
      }, 'gor');

      const request = createMockPostRequest('/api/gor/check-user', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.exists).toBe(true);
      expect(data.data.characterCompleted).toBe(true);
      expect(data.data.goreanStats.species).toBe(testCase.species);
      expect(data.data.goreanStats.characterName).toBe(`Test ${testCase.species}`);
    }
  });

  it('should not mix up users from different universes', async () => {
    const uuid = generateTestUUID();
    const username = generateTestUsername();

    // Create user in Arkana universe
    await prisma.user.create({
      data: {
        slUuid: uuid,
        universe: 'arkana',
        username: username,
        role: 'FREE',
        stats: {
          create: {
            health: 100,
            hunger: 100,
            thirst: 100
          }
        }
      }
    });

    // Try to check same UUID in Gor universe
    const body = createApiBody({
      sl_uuid: uuid,
      universe: 'gor'
    }, 'gor');

    const request = createMockPostRequest('/api/gor/check-user', body);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.exists).toBe(false); // Should not find Arkana user when checking Gor
  });
});
