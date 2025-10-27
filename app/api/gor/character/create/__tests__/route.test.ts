import { POST } from '../route';
import {
  createMockPostRequest,
  cleanupDatabase,
  expectSuccess,
  expectError,
  parseJsonResponse,
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

describe('POST /api/gor/character/create', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  // Helper to create user with valid token
  async function createUserWithToken(universe: string = 'gor') {
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

    const user = await prisma.user.create({
      data: {
        slUuid: uuid,
        universe: universe,
        username: `TestUser_${Date.now()}`,
        role: 'FREE',
        stats: universe === 'gor' ? {
          create: {
            health: 5,
            hunger: 100,
            thirst: 100
          }
        } : undefined
      }
    });

    const jwtSecret = process.env.JWT_SECRET || 'test_jwt_secret_for_testing_only';
    const token = jwt.sign(
      {
        sub: user.slUuid,
        universe: universe,
        purpose: 'gor_character_creation',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
        jti: `gor_${user.id}_${Date.now()}`
      },
      jwtSecret
    );

    await prisma.profileToken.create({
      data: {
        userId: user.id,
        token: token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    return { user, token, uuid };
  }

  // Helper to create valid Gorean character payload
  function createGoreanCharacterPayload(overrides: Record<string, unknown> = {}) {
    return {
      characterName: 'Tarl of Ko-ro-ba',
      agentName: 'Tarl, Warrior of the Scarlet Caste',
      title: 'Captain of the Guard',
      background: 'Born in Ko-ro-ba, trained in the Scarlet Caste',
      species: 'human',
      speciesCategory: 'sapient',
      speciesVariant: '',
      culture: 'southern_cities',
      cultureType: 'cityState',
      status: 'free_man',
      statusSubtype: '',
      casteRole: 'warriors',
      casteRoleType: 'highCaste',
      region: 'ar',
      homeStoneName: 'Ko-ro-ba',
      strength: 4,
      agility: 3,
      intellect: 2,
      perception: 3,
      charisma: 3, // Total: 15 = 5 base + 10 points
      skills: [
        { skill_id: 'swordplay', skill_name: 'Swordplay', level: 3 },
        { skill_id: 'tarn_riding', skill_name: 'Tarn Riding', level: 2 }
      ],
      skillsAllocatedPoints: 9, // Level 3 = 6 points, Level 2 = 3 points
      skillsSpentPoints: 9,
      token: '',
      universe: 'gor',
      ...overrides
    };
  }

  it('should create Gorean character successfully', async () => {
    const { user, token } = await createUserWithToken();
    const characterData = createGoreanCharacterPayload({ token });

    const request = createMockPostRequest('/api/gor/character/create', characterData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.goreanStats.characterName).toBe('Tarl of Ko-ro-ba');
    expect(data.data.goreanStats.species).toBe('human');
    expect(data.data.goreanStats.culture).toBe('southern_cities');
    expect(data.data.goreanStats.strength).toBe(4);
    expect(data.data.goreanStats.charisma).toBe(3);
    expect(data.data.goreanStats.healthMax).toBe(20); // Strength * 5
    expect(data.data.goreanStats.skills).toHaveLength(2);
    expect(data.data.goreanStats.registrationCompleted).toBe(true);
    expect(data.data.user.uuid).toBe(user.slUuid);

    // Verify character was created in database
    const goreanStats = await prisma.goreanStats.findUnique({
      where: { userId: user.id }
    });
    expect(goreanStats).toBeTruthy();
    expect(goreanStats?.characterName).toBe('Tarl of Ko-ro-ba');
    expect(goreanStats?.healthMax).toBe(20);

    // Verify token was deleted (one-time use)
    const deletedToken = await prisma.profileToken.findFirst({
      where: { token }
    });
    expect(deletedToken).toBeNull();
  });

  it('should calculate healthMax correctly from strength', async () => {
    const { token } = await createUserWithToken();

    const testCases = [
      { strength: 1, expectedHealth: 5 },
      { strength: 2, expectedHealth: 10 },
      { strength: 3, expectedHealth: 15 },
      { strength: 4, expectedHealth: 20 },
      { strength: 5, expectedHealth: 25 }
    ];

    for (const testCase of testCases) {
      const { user: newUser, token: newToken } = await createUserWithToken();
      // Calculate other stats to always use exactly 10 points
      // strength + agility + intellect + perception + charisma = 15 (5 base + 10 points)
      const remainingPoints = 15 - testCase.strength;
      const characterData = createGoreanCharacterPayload({
        token: newToken,
        strength: testCase.strength,
        agility: Math.min(5, Math.floor(remainingPoints / 4)),
        intellect: Math.min(5, Math.floor(remainingPoints / 4)),
        perception: Math.min(5, Math.floor(remainingPoints / 4)),
        charisma: remainingPoints - (Math.floor(remainingPoints / 4) * 3),
        characterName: `Test Character ${testCase.strength}`
      });

      const request = createMockPostRequest('/api/gor/character/create', characterData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.goreanStats.healthMax).toBe(testCase.expectedHealth);
      expect(data.data.goreanStats.healthCurrent).toBe(testCase.expectedHealth);
    }
  });

  it('should validate stat point allocation (10 points total)', async () => {
    const { token } = await createUserWithToken();

    // Valid: 4+3+2+3+2 = 14, minus 5 base = 9 points used (INVALID - should be 10)
    const invalidData = createGoreanCharacterPayload({
      token,
      strength: 4,
      agility: 3,
      intellect: 2,
      perception: 3,
      charisma: 2 // Total = 14, should be 15 (5 base + 10 points)
    });

    const request = createMockPostRequest('/api/gor/character/create', invalidData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
    expect(data.error).toContain('10 points');
  });

  it('should allow valid stat point allocation', async () => {
    const { token } = await createUserWithToken();

    // Valid: 5+4+2+2+2 = 15 (5 base + 10 points)
    const validData = createGoreanCharacterPayload({
      token,
      strength: 5,
      agility: 4,
      intellect: 2,
      perception: 2,
      charisma: 2
    });

    const request = createMockPostRequest('/api/gor/character/create', validData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.goreanStats.strength).toBe(5);
    expect(data.data.goreanStats.agility).toBe(4);
  });

  it('should validate skills point spending', async () => {
    const { token } = await createUserWithToken();

    // Invalid: Level 3 = 6 points, Level 2 = 3 points, total = 9, but says 5
    const invalidData = createGoreanCharacterPayload({
      token,
      skills: [
        { skill_id: 'swordplay', skill_name: 'Swordplay', level: 3 },
        { skill_id: 'archery', skill_name: 'Archery', level: 2 }
      ],
      skillsAllocatedPoints: 5,
      skillsSpentPoints: 5 // Should be 9!
    });

    const request = createMockPostRequest('/api/gor/character/create', invalidData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
    expect(data.error).toContain('Skill points');
  });

  it('should accept correct triangular skill costs', async () => {
    const { token } = await createUserWithToken();

    // Valid: Level 2 = 3 points, Level 1 = 1 point, total = 4
    const validData = createGoreanCharacterPayload({
      token,
      skills: [
        { skill_id: 'swordplay', skill_name: 'Swordplay', level: 2 },
        { skill_id: 'tracking', skill_name: 'Tracking', level: 1 }
      ],
      skillsAllocatedPoints: 5,
      skillsSpentPoints: 4
    });

    const request = createMockPostRequest('/api/gor/character/create', validData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.goreanStats.skills).toHaveLength(2);
    expect(data.data.goreanStats.skills[0].level).toBe(2);
  });

  it('should return 401 for invalid token', async () => {
    const characterData = createGoreanCharacterPayload({
      token: 'invalid-token-here'
    });

    const request = createMockPostRequest('/api/gor/character/create', characterData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(401);
  });

  it('should return 401 for expired token', async () => {
    const { user } = await createUserWithToken();

    // Create expired token
    const jwtSecret = process.env.JWT_SECRET || 'test_jwt_secret_for_testing_only';
    const expiredToken = jwt.sign(
      {
        sub: user.slUuid,
        universe: 'gor',
        purpose: 'gor_character_creation',
        iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago (expired)
        jti: `gor_${user.id}_expired`
      },
      jwtSecret
    );

    await prisma.profileToken.create({
      data: {
        userId: user.id,
        token: expiredToken,
        expiresAt: new Date(Date.now() - 3600000) // 1 hour ago
      }
    });

    const characterData = createGoreanCharacterPayload({
      token: expiredToken
    });

    const request = createMockPostRequest('/api/gor/character/create', characterData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(401);
  });

  it('should return 401 for wrong universe in token', async () => {
    const { token } = await createUserWithToken('arkana'); // Create arkana token

    const characterData = createGoreanCharacterPayload({
      token,
      universe: 'gor' // Try to use for gor
    });

    const request = createMockPostRequest('/api/gor/character/create', characterData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data, 'not valid for Gor universe');
    expect(response.status).toBe(401);
  });

  it('should update existing character instead of creating duplicate', async () => {
    const { user, token } = await createUserWithToken();

    // Create initial character
    await prisma.goreanStats.create({
      data: {
        userId: user.id,
        characterName: 'Old Character',
        agentName: 'Old Agent',
        species: 'human',
        speciesCategory: 'sapient',
        culture: 'southern_cities',
        cultureType: 'cityState',
        status: 'free_man',
        strength: 2,
        agility: 2,
        intellect: 2,
        perception: 2,
        charisma: 2,
        statPointsPool: 5,
        statPointsSpent: 5,
        healthMax: 10,
        goldCoin: 100, // Old currency
        silverCoin: 50,
        copperCoin: 200,
        registrationCompleted: false
      }
    });

    const characterData = createGoreanCharacterPayload({ token });

    const request = createMockPostRequest('/api/gor/character/create', characterData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.goreanStats.characterName).toBe('Tarl of Ko-ro-ba'); // Updated

    // Verify only one GoreanStats record exists
    const allStats = await prisma.goreanStats.findMany({
      where: { userId: user.id }
    });
    expect(allStats).toHaveLength(1);
    expect(allStats[0].characterName).toBe('Tarl of Ko-ro-ba');

    // Verify currency was preserved from old character
    expect(data.data.goreanStats.goldCoin).toBe(100);
    expect(data.data.goreanStats.silverCoin).toBe(50);
    expect(data.data.goreanStats.copperCoin).toBe(200);
  });

  it('should sync UserStats with Gorean character', async () => {
    const { user, token } = await createUserWithToken();
    const characterData = createGoreanCharacterPayload({ token });

    const request = createMockPostRequest('/api/gor/character/create', characterData);
    await POST(request);

    // Check UserStats was synced
    const userStats = await prisma.userStats.findUnique({
      where: { userId: user.id }
    });

    expect(userStats).toBeTruthy();
    expect(userStats?.health).toBe(20); // healthMax from character
    expect(userStats?.hunger).toBe(100);
    expect(userStats?.thirst).toBe(100);
    expect(userStats?.goldCoin).toBe(0); // New character defaults
    expect(userStats?.silverCoin).toBe(5);
    expect(userStats?.copperCoin).toBe(50);
  });

  it('should create character for animal species', async () => {
    const { token } = await createUserWithToken();

    const animalCharacter = createGoreanCharacterPayload({
      token,
      characterName: 'Thunder',
      agentName: 'Thunder the Larl',
      species: 'larl',
      speciesCategory: 'feline',
      culture: 'wild',
      cultureType: 'animal',
      status: 'wild',
      statusSubtype: '',
      casteRole: '', // Animals don't have castes
      casteRoleType: '',
      region: '',
      homeStoneName: '',
      strength: 5,
      agility: 4,
      intellect: 1,
      perception: 4,
      charisma: 1,
      skills: [
        { skill_id: 'scent_tracking', skill_name: 'Scent Tracking', level: 3 },
        { skill_id: 'pack_tactics', skill_name: 'Pack Tactics', level: 2 }
      ],
      skillsAllocatedPoints: 9,
      skillsSpentPoints: 9 // Level 3 = 6 points, Level 2 = 3 points
    });

    const request = createMockPostRequest('/api/gor/character/create', animalCharacter);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.goreanStats.species).toBe('larl');
    expect(data.data.goreanStats.speciesCategory).toBe('feline');
    expect(data.data.goreanStats.culture).toBe('wild');
    expect(data.data.goreanStats.status).toBe('wild');
    expect(data.data.goreanStats.casteRole).toBeNull();
  });

  it('should return 400 for missing required fields', async () => {
    const { token } = await createUserWithToken();

    const incompleteData = {
      // missing characterName
      agentName: 'Test Agent',
      token,
      universe: 'gor'
    };

    const request = createMockPostRequest('/api/gor/character/create', incompleteData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
  });

  it('should handle transaction rollback on error', async () => {
    const { user, token } = await createUserWithToken();

    // Create character with invalid data that will fail validation
    const invalidData = {
      characterName: 'Test',
      agentName: 'Test',
      species: 'human',
      speciesCategory: 'sapient',
      culture: 'southern_cities',
      cultureType: 'cityState',
      status: 'free_man',
      strength: 10, // Invalid: exceeds max of 5
      agility: 1,
      intellect: 1,
      perception: 1,
      charisma: 1,
      skills: [],
      skillsAllocatedPoints: 5,
      skillsSpentPoints: 0,
      token,
      universe: 'gor'
    };

    const request = createMockPostRequest('/api/gor/character/create', invalidData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);

    // Verify no GoreanStats was created
    const goreanStats = await prisma.goreanStats.findUnique({
      where: { userId: user.id }
    });
    expect(goreanStats).toBeNull();

    // Verify token still exists (wasn't deleted due to rollback)
    const existingToken = await prisma.profileToken.findFirst({
      where: { token }
    });
    expect(existingToken).toBeTruthy();
  });

  it('should handle clamp health when updating existing character with new healthMax', async () => {
    const { user, token } = await createUserWithToken();

    // Create character with high health
    await prisma.goreanStats.create({
      data: {
        userId: user.id,
        characterName: 'Old Character',
        agentName: 'Old Agent',
        species: 'human',
        speciesCategory: 'sapient',
        culture: 'southern_cities',
        cultureType: 'cityState',
        status: 'free_man',
        strength: 5, // healthMax = 25
        agility: 2,
        intellect: 2,
        perception: 2,
        charisma: 2,
        statPointsPool: 0,
        statPointsSpent: 10,
        healthMax: 25,
        healthCurrent: 25, // At max health
        registrationCompleted: false
      }
    });

    // Update with lower strength
    const characterData = createGoreanCharacterPayload({
      token,
      strength: 3, // New healthMax = 15
      agility: 3,
      intellect: 3,
      perception: 3,
      charisma: 3 // Total: 15 = 5 base + 10 points
    });

    const request = createMockPostRequest('/api/gor/character/create', characterData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.goreanStats.healthMax).toBe(15); // New max
    expect(data.data.goreanStats.healthCurrent).toBe(15); // Clamped from 25 to new max
  });
});
