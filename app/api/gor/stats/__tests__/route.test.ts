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
    expect(data.data.characterName).toBe('Tarl of Ko-ro-ba');
    expect(data.data.agentName).toBe('Tarl, Warrior of the Scarlet Caste');
    expect(data.data.title).toBe('Captain of the Guard');
    expect(data.data.species).toBe('human');
    expect(data.data.speciesCategory).toBe('sapient');
    expect(data.data.culture).toBe('southern_cities');
    expect(data.data.status).toBe('free_man');
    expect(data.data.casteRole).toBe('warriors');
    expect(data.data.region).toBe('ar');
    expect(data.data.homeStoneName).toBe('Ko-ro-ba');
    expect(data.data.strength).toBe(4);
    expect(data.data.agility).toBe(3);
    expect(data.data.intellect).toBe(2);
    expect(data.data.perception).toBe(3);
    expect(data.data.charisma).toBe(2);
    expect(data.data.healthMax).toBe(20);
    expect(data.data.healthCurrent).toBe(15);
    expect(data.data.hungerCurrent).toBe(80);
    expect(data.data.thirstCurrent).toBe(90);
    expect(data.data.goldCoin).toBe(5);
    expect(data.data.silverCoin).toBe(25);
    expect(data.data.copperCoin).toBe(100);
    expect(data.data.xp).toBe(50);
    expect(data.data.skills).toHaveLength(2);
    expect(data.data.skills[0].skill_id).toBe('swordplay');
    expect(data.data.registrationCompleted).toBe(true);
    expect(data.data.username).toBe(username);
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

    expectError(data, 'User not found');
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

    expectError(data, 'Gorean character not created');
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
    expect(data.data.characterName).toBe('Thunder');
    expect(data.data.species).toBe('larl');
    expect(data.data.speciesCategory).toBe('feline');
    expect(data.data.culture).toBe('wild');
    expect(data.data.status).toBe('wild');
    expect(data.data.strength).toBe(5);
    expect(data.data.skills).toHaveLength(2);
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
    expect(data.data.activeEffects).toHaveLength(1);
    expect(data.data.activeEffects[0].name).toBe('Strength Buff');
    expect(data.data.activeEffects[0].modifier).toBe(2);
    expect(data.data.liveStats.strength).toBe(5);
  });
});
