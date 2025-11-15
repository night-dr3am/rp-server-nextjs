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
        { skill_id: 'swordplay', skill_name: 'Swordplay', level: 2, xp: 0 },
        { skill_id: 'archery', skill_name: 'Archery', level: 2, xp: 0 }
      ],
      skillsAllocatedPoints: 5, // Linear costs: Level 2 = 2 points each, total 4 points
      skillsSpentPoints: 4,
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
    expect(data.data.goreanStats.healthMax).toBe(101); // 50 (human base) + 40 (str 4*10) + 9 (warrior 10%) + 2 (swordplay lvl 2)
    expect(data.data.goreanStats.skills).toHaveLength(2);
    expect(data.data.goreanStats.registrationCompleted).toBe(true);
    expect(data.data.user.uuid).toBe(user.slUuid);

    // Verify character was created in database
    const goreanStats = await prisma.goreanStats.findUnique({
      where: { userId: user.id }
    });
    expect(goreanStats).toBeTruthy();
    expect(goreanStats?.characterName).toBe('Tarl of Ko-ro-ba');
    expect(goreanStats?.healthMax).toBe(101);

    // Verify token was deleted (one-time use)
    const deletedToken = await prisma.profileToken.findFirst({
      where: { token }
    });
    expect(deletedToken).toBeNull();
  });

  it('should calculate healthMax correctly from strength', async () => {
    // Human warrior with Swordplay level 2: 50 base + (str*10) + 10% warrior bonus + 2 skill HP
    const testCases = [
      { strength: 1, expectedHealth: 68 },  // 50 + 10 + 6 (10%) + 2 = 68
      { strength: 2, expectedHealth: 79 },  // 50 + 20 + 7 (10%) + 2 = 79
      { strength: 3, expectedHealth: 90 },  // 50 + 30 + 8 (10%) + 2 = 90
      { strength: 4, expectedHealth: 101 }, // 50 + 40 + 9 (10%) + 2 = 101
      { strength: 5, expectedHealth: 112 }  // 50 + 50 + 10 (10%) + 2 = 112
    ];

    for (const testCase of testCases) {
      const { token: newToken } = await createUserWithToken();
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

    // Invalid: Level 3 = 3 points, Level 2 = 2 points, total = 5, but says 3
    const invalidData = createGoreanCharacterPayload({
      token,
      skills: [
        { skill_id: 'swordplay', skill_name: 'Swordplay', level: 3, xp: 0 },
        { skill_id: 'archery', skill_name: 'Archery', level: 2, xp: 0 }
      ],
      skillsAllocatedPoints: 5,
      skillsSpentPoints: 3 // Should be 5!
    });

    const request = createMockPostRequest('/api/gor/character/create', invalidData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
    expect(data.error).toContain('Skill points');
  });

  it('should accept correct linear skill costs', async () => {
    const { token } = await createUserWithToken();

    // Valid: Level 2 = 2 points, Level 1 = 1 point, total = 3
    const validData = createGoreanCharacterPayload({
      token,
      skills: [
        { skill_id: 'swordplay', skill_name: 'Swordplay', level: 2, xp: 0 },
        { skill_id: 'hunting', skill_name: 'Hunting', level: 1, xp: 0 }
      ],
      skillsAllocatedPoints: 5,
      skillsSpentPoints: 3
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

    // Update UserStats with old currency (user already has UserStats from createUserWithToken)
    await prisma.userStats.update({
      where: { userId: user.id },
      data: {
        health: 10,
        hunger: 100,
        thirst: 100,
        goldCoin: 100, // Old currency to be preserved
        silverCoin: 50,
        copperCoin: 200
      }
    });

    // Create initial character (no coins in GoreanStats)
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
        // goldCoin, silverCoin, copperCoin removed - now in UserStats only
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
    expect(userStats?.health).toBe(101); // healthMax from character (50 + 40 + 9 + 2)
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
        { skill_id: 'hunting', skill_name: 'Hunting', level: 2, xp: 0 },
        { skill_id: 'stealth', skill_name: 'Stealth', level: 2, xp: 0 }
      ],
      skillsAllocatedPoints: 5,
      skillsSpentPoints: 4 // Linear costs: Level 2 = 2 points each, total 4
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
      strength: 3, // New healthMax = 90 (50 + 30 + 8 warrior bonus + 2 swordplay)
      agility: 3,
      intellect: 3,
      perception: 3,
      charisma: 3 // Total: 15 = 5 base + 10 points
    });

    const request = createMockPostRequest('/api/gor/character/create', characterData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.goreanStats.healthMax).toBe(90); // New max (50 + 30 + 8 + 2)
    expect(data.data.goreanStats.healthCurrent).toBe(25); // Preserved from old character (updating doesn't heal)
  });

  it('should reject skill level exceeding maxInitialLevel', async () => {
    const { token } = await createUserWithToken();

    // Lockpicking is a specialized skill with maxInitialLevel: 1
    const invalidData = createGoreanCharacterPayload({
      token,
      skills: [
        { skill_id: 'lockpicking', skill_name: 'Lockpicking', level: 2, xp: 0 } // Exceeds max!
      ],
      skillsAllocatedPoints: 5,
      skillsSpentPoints: 2
    });

    const request = createMockPostRequest('/api/gor/character/create', invalidData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
    expect(data.error).toContain('Lockpicking');
    expect(data.error).toContain('exceeds maximum initial level');
  });

  it('should accept skill at maxInitialLevel limit', async () => {
    const { token } = await createUserWithToken();

    // Lockpicking maxInitialLevel: 1, Blacksmithing maxInitialLevel: 1
    const validData = createGoreanCharacterPayload({
      token,
      skills: [
        { skill_id: 'lockpicking', skill_name: 'Lockpicking', level: 1, xp: 0 },
        { skill_id: 'blacksmithing', skill_name: 'Blacksmithing', level: 1, xp: 0 },
        { skill_id: 'swordplay', skill_name: 'Swordplay', level: 2, xp: 0 } // Regular skill at level 2
      ],
      skillsAllocatedPoints: 5,
      skillsSpentPoints: 4 // 1 + 1 + 2 = 4
    });

    const request = createMockPostRequest('/api/gor/character/create', validData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.goreanStats.skills).toHaveLength(3);
    expect(data.data.goreanStats.skills.find((s: { skill_id: string }) => s.skill_id === 'lockpicking')?.level).toBe(1);
    expect(data.data.goreanStats.skills.find((s: { skill_id: string }) => s.skill_id === 'blacksmithing')?.level).toBe(1);
    expect(data.data.goreanStats.skills.find((s: { skill_id: string }) => s.skill_id === 'swordplay')?.level).toBe(2);
  });

  it('should reject sapient-only skill for non-sapient species', async () => {
    const { token } = await createUserWithToken();

    // Larl is a feline species, not sapient
    const invalidData = createGoreanCharacterPayload({
      token,
      species: 'larl',
      speciesCategory: 'feline',
      skills: [
        { skill_id: 'swordplay', skill_name: 'Swordplay', level: 2, xp: 0 } // Sapient-only skill
      ],
      skillsAllocatedPoints: 5,
      skillsSpentPoints: 2
    });

    const request = createMockPostRequest('/api/gor/character/create', invalidData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data, 'Skill "Swordplay" is not available for Larl (feline species)');
    expect(response.status).toBe(400);
  });

  it('should accept universal skills for non-sapient species', async () => {
    const { token } = await createUserWithToken();

    // Larl is a feline species
    const validData = createGoreanCharacterPayload({
      token,
      species: 'larl',
      speciesCategory: 'feline',
      culture: 'wild',
      cultureType: 'animal',
      status: 'wild',
      skills: [
        { skill_id: 'unarmed_combat', skill_name: 'Unarmed Combat', level: 2, xp: 0 }, // Universal skill
        { skill_id: 'hunting', skill_name: 'Hunting', level: 2, xp: 0 }, // Universal skill
        { skill_id: 'stealth', skill_name: 'Stealth', level: 1, xp: 0 } // Universal skill
      ],
      skillsAllocatedPoints: 5,
      skillsSpentPoints: 5 // 2 + 2 + 1 = 5
    });

    const request = createMockPostRequest('/api/gor/character/create', validData);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.goreanStats.species).toBe('larl');
    expect(data.data.goreanStats.speciesCategory).toBe('feline');
    expect(data.data.goreanStats.skills).toHaveLength(3);
    expect(data.data.goreanStats.skills.find((s: { skill_id: string }) => s.skill_id === 'unarmed_combat')?.level).toBe(2);
    expect(data.data.goreanStats.skills.find((s: { skill_id: string }) => s.skill_id === 'hunting')?.level).toBe(2);
    expect(data.data.goreanStats.skills.find((s: { skill_id: string }) => s.skill_id === 'stealth')?.level).toBe(1);
  });
});
