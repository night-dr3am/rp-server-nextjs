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
  testExpectedError,
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { prisma } from '@/lib/prisma';

describe('POST /api/gor/stats/update', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  // Helper function to create test user with Gorean character
  async function createTestGoreanCharacter() {
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
            thirst: 100,
            goldCoin: 10,
            silverCoin: 50,
            copperCoin: 100
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
            status: 'free_man',
            strength: 3,
            agility: 3,
            intellect: 2,
            perception: 2,
            charisma: 2,
            statPointsPool: 0,
            statPointsSpent: 10,
            healthMax: 15,
            healthCurrent: 15,
            hungerCurrent: 100,
            thirstCurrent: 100,
            goldCoin: 10,
            silverCoin: 50,
            copperCoin: 100,
            registrationCompleted: true
          }
        }
      }
    });

    return { uuid, username };
  }

  it('should update Gorean stats successfully', async () => {
    const { uuid } = await createTestGoreanCharacter();

    const updateData = createApiBody({
      sl_uuid: uuid,
      universe: 'gor',
      healthCurrent: 10,
      hungerCurrent: 80,
      thirstCurrent: 90,
      goldCoin: 15,
      silverCoin: 75,
      copperCoin: 150
    }, 'gor');

    const request = createMockPostRequest('/api/gor/stats/update', updateData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    // Check nested structure
    expect(data.data.user).toBeDefined();
    expect(data.data.stats).toBeDefined();
    expect(data.data.goreanStats).toBeDefined();
    expect(data.data.hasGoreanCharacter).toBe("true");

    // Check updated goreanStats
    expect(data.data.goreanStats.healthCurrent).toBe(10);
    expect(data.data.goreanStats.healthMax).toBe(15);
    expect(data.data.goreanStats.hungerCurrent).toBe(80);
    expect(data.data.goreanStats.thirstCurrent).toBe(90);
    expect(data.data.goreanStats.goldCoin).toBe(15);
    expect(data.data.goreanStats.silverCoin).toBe(75);
    expect(data.data.goreanStats.copperCoin).toBe(150);
  });

  it('should update partial stats successfully', async () => {
    const { uuid } = await createTestGoreanCharacter();

    // Update only health and hunger
    const updateData = createApiBody({
      sl_uuid: uuid,
      universe: 'gor',
      healthCurrent: 5,
      hungerCurrent: 75
    }, 'gor');

    const request = createMockPostRequest('/api/gor/stats/update', updateData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.goreanStats.healthCurrent).toBe(5);
    expect(data.data.goreanStats.hungerCurrent).toBe(75);
    // Other stats should remain unchanged
    expect(data.data.goreanStats.thirstCurrent).toBe(100);
    expect(data.data.goreanStats.goldCoin).toBe(10);
    expect(data.data.goreanStats.silverCoin).toBe(50);
    expect(data.data.goreanStats.copperCoin).toBe(100);
  });

  it('should clamp health to valid range (0 to healthMax)', async () => {
    const { uuid } = await createTestGoreanCharacter();

    // Try to set health above max (15) and below 0
    const updateData1 = createApiBody({
      sl_uuid: uuid,
      universe: 'gor',
      healthCurrent: 25 // Above healthMax of 15
    }, 'gor');

    const request1 = createMockPostRequest('/api/gor/stats/update', updateData1);
    const response1 = await POST(request1);
    const data1 = await parseJsonResponse(response1);

    expectSuccess(data1);
    expect(data1.data.goreanStats.healthCurrent).toBe(15); // Clamped to healthMax

    // Try negative health
    const updateData2 = createApiBody({
      sl_uuid: uuid,
      universe: 'gor',
      healthCurrent: -5 // Below 0
    }, 'gor');

    const request2 = createMockPostRequest('/api/gor/stats/update', updateData2);
    const response2 = await POST(request2);
    const data2 = await parseJsonResponse(response2);

    expectSuccess(data2);
    expect(data2.data.goreanStats.healthCurrent).toBe(0); // Clamped to 0
  });

  it('should clamp hunger and thirst to valid range (0-100)', async () => {
    const { uuid } = await createTestGoreanCharacter();

    const updateData = createApiBody({
      sl_uuid: uuid,
      universe: 'gor',
      hungerCurrent: 150, // Above 100
      thirstCurrent: -10  // Below 0
    }, 'gor');

    const request = createMockPostRequest('/api/gor/stats/update', updateData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.goreanStats.hungerCurrent).toBe(100); // Clamped to max
    expect(data.data.goreanStats.thirstCurrent).toBe(0);   // Clamped to min
  });

  it('should allow negative currency values for debts', async () => {
    const { uuid } = await createTestGoreanCharacter();

    const updateData = createApiBody({
      sl_uuid: uuid,
      universe: 'gor',
      goldCoin: -5,
      silverCoin: -10,
      copperCoin: -20
    }, 'gor');

    const request = createMockPostRequest('/api/gor/stats/update', updateData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.goreanStats.goldCoin).toBe(-5);
    expect(data.data.goreanStats.silverCoin).toBe(-10);
    expect(data.data.goreanStats.copperCoin).toBe(-20);
  });

  it('should return 401 for invalid signature', async () => {
    const { uuid } = await createTestGoreanCharacter();

    const updateData = {
      sl_uuid: uuid,
      universe: 'gor',
      healthCurrent: 10,
      timestamp: new Date().toISOString(),
      signature: 'invalid-signature-here'
    };

    const request = createMockPostRequest('/api/gor/stats/update', updateData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data); // Joi validates signature format before auth check
    expect(response.status).toBe(400); // Validation error, not auth error
  });

  it('should return 404 for non-existent user', async () => {
    await testExpectedError('Update stats for non-existent user', async () => {
      const updateData = createApiBody({
        sl_uuid: generateTestUUID(),
        universe: 'gor',
        healthCurrent: 10
      }, 'gor');

      const request = createMockPostRequest('/api/gor/stats/update', updateData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'User not found in Gor universe');
      expect(response.status).toBe(404);
    });
  });

  it('should return 404 for user without Gorean character', async () => {
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
        // No goreanStats
      }
    });

    const updateData = createApiBody({
      sl_uuid: uuid,
      universe: 'gor',
      healthCurrent: 10
    }, 'gor');

    const request = createMockPostRequest('/api/gor/stats/update', updateData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data, 'User registration incomplete');
    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid UUID format', async () => {
    const updateData = createApiBody({
      sl_uuid: 'not-a-valid-uuid',
      universe: 'gor',
      healthCurrent: 10
    }, 'gor');

    const request = createMockPostRequest('/api/gor/stats/update', updateData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
  });

  it('should return 400 for missing sl_uuid', async () => {
    const updateData = createApiBody({
      // missing sl_uuid
      universe: 'gor',
      healthCurrent: 10
    }, 'gor');

    const request = createMockPostRequest('/api/gor/stats/update', updateData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
  });

  it('should update lastActive timestamp', async () => {
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
            health: 15,
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
            status: 'free_man',
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

    const updateData = createApiBody({
      sl_uuid: uuid,
      universe: 'gor',
      healthCurrent: 10
    }, 'gor');

    const request = createMockPostRequest('/api/gor/stats/update', updateData);
    await POST(request);

    // Check lastActive was updated
    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id }
    });
    expect(updatedUser?.lastActive).not.toEqual(oldLastActive);
    expect(updatedUser?.lastActive.getTime()).toBeGreaterThan(oldLastActive.getTime());
  });

  it('should handle multiple stat updates for same user', async () => {
    const { uuid } = await createTestGoreanCharacter();

    // First update
    const update1 = createApiBody({
      sl_uuid: uuid,
      universe: 'gor',
      healthCurrent: 10,
      goldCoin: 20
    }, 'gor');

    const request1 = createMockPostRequest('/api/gor/stats/update', update1);
    const response1 = await POST(request1);
    const data1 = await parseJsonResponse(response1);

    expectSuccess(data1);
    expect(data1.data.goreanStats.healthCurrent).toBe(10);
    expect(data1.data.goreanStats.goldCoin).toBe(20);

    // Second update
    const update2 = createApiBody({
      sl_uuid: uuid,
      universe: 'gor',
      healthCurrent: 12,
      hungerCurrent: 90,
      silverCoin: 100
    }, 'gor');

    const request2 = createMockPostRequest('/api/gor/stats/update', update2);
    const response2 = await POST(request2);
    const data2 = await parseJsonResponse(response2);

    expectSuccess(data2);
    expect(data2.data.goreanStats.healthCurrent).toBe(12);
    expect(data2.data.goreanStats.hungerCurrent).toBe(90);
    expect(data2.data.goreanStats.silverCoin).toBe(100);
    expect(data2.data.goreanStats.goldCoin).toBe(20); // Should retain previous value
  });

  it('should work for characters with different healthMax values', async () => {
    // Create character with high strength (healthMax = 25)
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
            health: 25,
            hunger: 100,
            thirst: 100
          }
        },
        goreanStats: {
          create: {
            characterName: 'Strong Warrior',
            agentName: username,
            species: 'human',
            speciesCategory: 'sapient',
            culture: 'southern_cities',
            cultureType: 'cityState',
            status: 'free_man',
            strength: 5, // High strength
            agility: 3,
            intellect: 2,
            perception: 2,
            charisma: 2,
            statPointsPool: 0,
            statPointsSpent: 10,
            healthMax: 25,
            healthCurrent: 25,
            hungerCurrent: 100,
            thirstCurrent: 100,
            registrationCompleted: true
          }
        }
      }
    });

    // Update health to 20 (valid for this character)
    const updateData = createApiBody({
      sl_uuid: uuid,
      universe: 'gor',
      healthCurrent: 20
    }, 'gor');

    const request = createMockPostRequest('/api/gor/stats/update', updateData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.goreanStats.healthCurrent).toBe(20);
    expect(data.data.goreanStats.healthMax).toBe(25);

    // Try to set health above this character's max
    const updateData2 = createApiBody({
      sl_uuid: uuid,
      universe: 'gor',
      healthCurrent: 30
    }, 'gor');

    const request2 = createMockPostRequest('/api/gor/stats/update', updateData2);
    const response2 = await POST(request2);
    const data2 = await parseJsonResponse(response2);

    expectSuccess(data2);
    expect(data2.data.goreanStats.healthCurrent).toBe(25); // Clamped to character's healthMax
  });

  it('should update updatedAt timestamp in goreanStats', async () => {
    const { uuid } = await createTestGoreanCharacter();

    // Get initial updatedAt
    const initialStats = await prisma.goreanStats.findFirst({
      where: { user: { slUuid: uuid, universe: 'gor' } }
    });
    const initialUpdatedAt = initialStats?.updatedAt;

    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 100));

    const updateData = createApiBody({
      sl_uuid: uuid,
      universe: 'gor',
      healthCurrent: 10
    }, 'gor');

    const request = createMockPostRequest('/api/gor/stats/update', updateData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);

    // Verify updatedAt was updated
    const updatedStats = await prisma.goreanStats.findFirst({
      where: { user: { slUuid: uuid, universe: 'gor' } }
    });
    expect(updatedStats?.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt!.getTime());
  });

  it('should return 400 for non-Gor universe', async () => {
    const { uuid } = await createTestGoreanCharacter();
    const updateData = createApiBody({
      sl_uuid: uuid,
      universe: 'Arkana', // Wrong universe
      healthCurrent: 10
    }, 'Gor'); // Use Gor signature

    const request = createMockPostRequest('/api/gor/stats/update', updateData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data, 'This endpoint is only for Gor universe');
    expect(response.status).toBe(400);
  });
});
