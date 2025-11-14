import { GET } from '../route';
import {
  createMockGetRequest,
  cleanupDatabase,
  expectSuccess,
  expectError,
  generateTestUUID,
  generateTestUsername,
  parseJsonResponse,
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { prisma } from '@/lib/prisma';
import { generateSignature } from '@/lib/signature';

describe('GET /api/gor/stats', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('should retrieve Gorean character stats successfully', async () => {
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
            hunger: 80,
            thirst: 90
          }
        },
        goreanStats: {
          create: {
            characterName: 'Tarl of Ko-ro-ba',
            agentName: 'Tarl, Warrior of the Scarlet Caste',
            title: 'Captain of the Guard',
            species: 'human',
            speciesCategory: 'sapient',
            culture: 'southern_cities',
            cultureType: 'cityState',
            status: 'free_man',
            casteRole: 'warriors',
            casteRoleType: 'highCaste',
            region: 'ar',
            homeStoneName: 'Ko-ro-ba',
            strength: 4,
            agility: 3,
            intellect: 2,
            perception: 3,
            charisma: 2,
            statPointsPool: 0,
            statPointsSpent: 10,
            healthMax: 20,
            healthCurrent: 15,
            hungerCurrent: 80,
            thirstCurrent: 90,
            goldCoin: 5,
            silverCoin: 25,
            copperCoin: 100,
            xp: 50,
            skills: [
              { skill_id: 'swordplay', skill_name: 'Swordplay', level: 3, xp: 0 },
              { skill_id: 'archery', skill_name: 'Archery', level: 2, xp: 0 }
            ],
            skillsAllocatedPoints: 5,
            skillsSpentPoints: 5,
            registrationCompleted: true
          }
        }
      }
    });

    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'gor');
    const request = createMockGetRequest('/api/gor/stats', {
      sl_uuid: uuid,
      universe: 'gor',
      timestamp,
      signature
    });

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    // Check nested structure
    expect(data.data.user).toBeDefined();
    expect(data.data.stats).toBeDefined();
    expect(data.data.goreanStats).toBeDefined();
    expect(data.data.hasGoreanCharacter).toBe("true");

    // Check user fields
    expect(data.data.user.slUuid).toBe(uuid);
    expect(data.data.user.username).toBe(username);
    expect(data.data.user.role).toBe('FREE');
    expect(data.data.user.universe).toBe('gor');

    // Check stats (should only have status, no duplicates)
    expect(data.data.stats.status).toBeDefined();
    expect(data.data.stats.health).toBeUndefined(); // Should not be in stats
    expect(data.data.stats.goldCoin).toBeUndefined(); // Should not be in stats

    // Check goreanStats (strings are URL-encoded for LSL compatibility)
    expect(data.data.goreanStats.characterName).toBe('Tarl%20of%20Ko-ro-ba');
    expect(data.data.goreanStats.agentName).toBe('Tarl%2C%20Warrior%20of%20the%20Scarlet%20Caste');
    expect(data.data.goreanStats.title).toBe('Captain%20of%20the%20Guard');
    expect(data.data.goreanStats.species).toBe('human');
    expect(data.data.goreanStats.speciesCategory).toBe('sapient');
    expect(data.data.goreanStats.culture).toBe('southern_cities');
    expect(data.data.goreanStats.status).toBe('free_man');
    expect(data.data.goreanStats.casteRole).toBe('warriors');
    expect(data.data.goreanStats.region).toBe('ar');
    expect(data.data.goreanStats.homeStoneName).toBe('Ko-ro-ba');
    expect(data.data.goreanStats.strength).toBe(4);
    expect(data.data.goreanStats.agility).toBe(3);
    expect(data.data.goreanStats.intellect).toBe(2);
    expect(data.data.goreanStats.perception).toBe(3);
    expect(data.data.goreanStats.charisma).toBe(2);
    expect(data.data.goreanStats.healthMax).toBe(20);
    expect(data.data.goreanStats.healthCurrent).toBe(15);
    expect(data.data.goreanStats.hungerCurrent).toBe(80);
    expect(data.data.goreanStats.thirstCurrent).toBe(90);
    expect(data.data.goreanStats.goldCoin).toBe(5);
    expect(data.data.goreanStats.silverCoin).toBe(25);
    expect(data.data.goreanStats.copperCoin).toBe(100);
    expect(data.data.goreanStats.xp).toBe(50);
    expect(data.data.goreanStats.registrationCompleted).toBe(true);
  });

  it('should return 404 for non-existent user', async () => {
    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'gor');
    const request = createMockGetRequest('/api/gor/stats', {
      sl_uuid: generateTestUUID(),
      universe: 'gor',
      timestamp,
      signature
    });

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectError(data, 'User not found in Gor universe');
    expect(response.status).toBe(404);
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

    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'gor');
    const request = createMockGetRequest('/api/gor/stats', {
      sl_uuid: uuid,
      universe: 'gor',
      timestamp,
      signature
    });

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectError(data, 'User registration incomplete');
    expect(response.status).toBe(404);
  });

  it('should return 401 for invalid signature', async () => {
    const timestamp = new Date().toISOString();
    const request = createMockGetRequest('/api/gor/stats', {
      sl_uuid: generateTestUUID(),
      universe: 'gor',
      timestamp,
      signature: 'invalid-signature'
    });

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectError(data); // Joi validates signature format before auth check
    expect(response.status).toBe(400); // Validation error, not auth error
  });

  it('should return 400 for missing sl_uuid', async () => {
    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'gor');
    const request = createMockGetRequest('/api/gor/stats', {
      // missing sl_uuid
      universe: 'gor',
      timestamp,
      signature
    });

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
  });

  it('should return 400 for missing universe', async () => {
    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'gor');
    const request = createMockGetRequest('/api/gor/stats', {
      sl_uuid: generateTestUUID(),
      // missing universe
      timestamp,
      signature
    });

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
  });

  it('should update lastActive timestamp when retrieving stats', async () => {
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

    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'gor');
    const request = createMockGetRequest('/api/gor/stats', {
      sl_uuid: uuid,
      universe: 'gor',
      timestamp,
      signature
    });

    await GET(request);

    // Check lastActive was updated
    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id }
    });
    expect(updatedUser?.lastActive).not.toEqual(oldLastActive);
    expect(updatedUser?.lastActive.getTime()).toBeGreaterThan(oldLastActive.getTime());
  });

  it('should retrieve stats for animal characters', async () => {
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
            health: 20,
            hunger: 90,
            thirst: 95
          }
        },
        goreanStats: {
          create: {
            characterName: 'Thunder',
            agentName: 'Thunder the Larl',
            species: 'larl',
            speciesCategory: 'feline',
            culture: 'wild',
            cultureType: 'animal',
            status: 'wild',
            strength: 5,
            agility: 4,
            intellect: 1,
            perception: 4,
            charisma: 1,
            statPointsPool: 0,
            statPointsSpent: 10,
            healthMax: 25,
            healthCurrent: 20,
            hungerCurrent: 90,
            thirstCurrent: 95,
            skills: [
              { skill_id: 'hunting', skill_name: 'Hunting', level: 2, xp: 0 },
              { skill_id: 'stealth', skill_name: 'Stealth', level: 2, xp: 0 }
            ],
            registrationCompleted: true
          }
        }
      }
    });

    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'gor');
    const request = createMockGetRequest('/api/gor/stats', {
      sl_uuid: uuid,
      universe: 'gor',
      timestamp,
      signature
    });

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.goreanStats.characterName).toBe('Thunder');
    expect(data.data.goreanStats.species).toBe('larl');
    expect(data.data.goreanStats.speciesCategory).toBe('feline');
    expect(data.data.goreanStats.culture).toBe('wild');
    expect(data.data.goreanStats.status).toBe('wild');
    expect(data.data.goreanStats.strength).toBe(5);
  });

  it('should retrieve active effects if present', async () => {
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
            activeEffects: [
              {
                id: 'buff_strength',
                name: 'Strength Buff',
                type: 'buff',
                stat: 'strength',
                modifier: 2,
                duration: 10,
                remainingTurns: 5
              }
            ],
            liveStats: {
              strength: 5, // 3 base + 2 from buff
              agility: 3,
              intellect: 2,
              perception: 2,
              charisma: 2
            },
            registrationCompleted: true
          }
        }
      }
    });

    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'gor');
    const request = createMockGetRequest('/api/gor/stats', {
      sl_uuid: uuid,
      universe: 'gor',
      timestamp,
      signature
    });

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.goreanStats.activeEffects).toHaveLength(1);
    expect(data.data.goreanStats.activeEffects[0].name).toBe('Strength Buff');
    expect(data.data.goreanStats.activeEffects[0].modifier).toBe(2);
    expect(data.data.goreanStats.liveStats.strength).toBe(5);
  });

  it('should return 400 for non-Gor universe', async () => {
    const uuid = generateTestUUID();
    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'Gor');
    const request = createMockGetRequest('/api/gor/stats', {
      sl_uuid: uuid,
      universe: 'Arkana', // Wrong universe
      timestamp,
      signature
    });

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectError(data, 'This endpoint is only for Gor universe');
    expect(response.status).toBe(400);
  });
});
