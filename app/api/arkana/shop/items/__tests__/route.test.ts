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
import type { ShopCybernetic, ShopMagicSchool } from '@/lib/arkana/shopHelpers';

describe('GET /api/arkana/shop/items', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('should return available cybernetics and magic items', async () => {
    const { user, token } = await createTestUser('arkana');

    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Test Character',
        agentName: 'TestAgent',
        race: 'Human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 2,
        maxHP: 10,
        xp: 500,
        cyberneticAugments: [],
        magicSchools: [],
        magicWeaves: [],
        arkanaRole: 'player',
        registrationCompleted: true
      }
    });

    const sessionId = 'test-session-' + Date.now();
    const request = createMockGetRequest(
      `/api/arkana/shop/items?sl_uuid=${user.slUuid}&universe=arkana&token=${token}&sessionId=${sessionId}`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.currentXp).toBe(500);
    expect(data.data.cybernetics).toBeDefined();
    expect(data.data.magicSchools).toBeDefined();
    expect(data.data.characterInfo.race).toBe('Human');
    expect(data.data.characterInfo.archetype).toBe('Arcanist');
  });

  it('should mark owned cybernetics as owned', async () => {
    const { user, token } = await createTestUser('arkana');

    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Cyber Character',
        agentName: 'CyberAgent',
        race: 'Human',
        archetype: 'Synthral',
        physical: 3,
        dexterity: 3,
        mental: 2,
        perception: 2,
        maxHP: 12,
        xp: 300,
        cyberneticAugments: ['cyber_enhanced_vision'], // Already owns this
        magicSchools: [],
        magicWeaves: [],
        arkanaRole: 'player',
        registrationCompleted: true
      }
    });

    const sessionId = 'test-session-' + Date.now();
    const request = createMockGetRequest(
      `/api/arkana/shop/items?sl_uuid=${user.slUuid}&universe=arkana&token=${token}&sessionId=${sessionId}`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);

    // Find the owned cybernetic in the response
    let foundOwned = false;
    Object.values(data.data.cybernetics as Record<string, ShopCybernetic[]>).forEach((section) => {
      section.forEach((cyber) => {
        if (cyber.id === 'cyber_enhanced_vision') {
          expect(cyber.owned).toBe(true);
          foundOwned = true;
        }
      });
    });

    expect(foundOwned).toBe(true);
  });

  it('should filter magic by race (Synthral gets Technomancy)', async () => {
    const { user, token } = await createTestUser('arkana');

    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Synthral Character',
        agentName: 'SynthralAgent',
        race: 'Human',
        archetype: 'Synthral',
        physical: 2,
        dexterity: 3,
        mental: 4,
        perception: 2,
        maxHP: 12,
        xp: 400,
        cyberneticAugments: [],
        magicSchools: [],
        magicWeaves: [],
        arkanaRole: 'player',
        registrationCompleted: true
      }
    });

    const sessionId = 'test-session-' + Date.now();
    const request = createMockGetRequest(
      `/api/arkana/shop/items?sl_uuid=${user.slUuid}&universe=arkana&token=${token}&sessionId=${sessionId}`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);

    // Synthrals should have access to Technomancy school
    const hasTechnomancy = (data.data.magicSchools as ShopMagicSchool[]).some((school) =>
      school.section === 'Technomancy'
    );

    expect(hasTechnomancy).toBe(true);
  });

  it('should mark owned magic schools and weaves as owned', async () => {
    const { user, token } = await createTestUser('arkana');

    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Magic User',
        agentName: 'MagicAgent',
        race: 'Human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 2,
        mental: 4,
        perception: 3,
        maxHP: 12,
        xp: 200,
        cyberneticAugments: [],
        magicSchools: ['school_elemental'],
        magicWeaves: ['weave_fire_bolt'],
        arkanaRole: 'player',
        registrationCompleted: true
      }
    });

    const sessionId = 'test-session-' + Date.now();
    const request = createMockGetRequest(
      `/api/arkana/shop/items?sl_uuid=${user.slUuid}&universe=arkana&token=${token}&sessionId=${sessionId}`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);

    // Find the elemental school
    const elementalSchool = (data.data.magicSchools as ShopMagicSchool[]).find((school) =>
      school.schoolId === 'school_elemental'
    );

    expect(elementalSchool).toBeDefined();
    expect(elementalSchool?.owned).toBe(true);

    // Find the owned weave
    const ownedWeave = elementalSchool?.weaves.find((weave) =>
      weave.id === 'weave_fire_bolt'
    );

    expect(ownedWeave).toBeDefined();
    expect(ownedWeave?.owned).toBe(true);
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
        maxHP: 10,
        xp: 0,
        registrationCompleted: true
      }
    });

    const request = createMockGetRequest(
      `/api/arkana/shop/items?sl_uuid=${user.slUuid}&universe=arkana&token=${token}`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
  });

  it('should fail with invalid token', async () => {
    const { user } = await createTestUser('arkana');

    const sessionId = 'test-session-' + Date.now();
    const request = createMockGetRequest(
      `/api/arkana/shop/items?sl_uuid=${user.slUuid}&universe=arkana&token=invalid-token&sessionId=${sessionId}`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(401);
  });

  it('should fail for user without Arkana character', async () => {
    const { user, token } = await createTestUser('arkana');

    const sessionId = 'test-session-' + Date.now();
    const request = createMockGetRequest(
      `/api/arkana/shop/items?sl_uuid=${user.slUuid}&universe=arkana&token=${token}&sessionId=${sessionId}`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(data.error).toContain('Arkana character not found');
    expect(response.status).toBe(404);
  });

  it('should return no magic for Spliced race (cannot use magic)', async () => {
    const { user, token } = await createTestUser('arkana');

    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Spliced Character',
        agentName: 'SplicedAgent',
        race: 'Spliced',
        subrace: 'Predators',
        archetype: '',
        physical: 4,
        dexterity: 3,
        mental: 2,
        perception: 3,
        maxHP: 15,
        xp: 300,
        cyberneticAugments: [],
        magicSchools: [],
        magicWeaves: [],
        arkanaRole: 'player',
        registrationCompleted: true
      }
    });

    const sessionId = 'test-session-' + Date.now();
    const request = createMockGetRequest(
      `/api/arkana/shop/items?sl_uuid=${user.slUuid}&universe=arkana&token=${token}&sessionId=${sessionId}`
    );

    const response = await GET(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.magicSchools).toHaveLength(0); // Spliced cannot use magic
  });
});
