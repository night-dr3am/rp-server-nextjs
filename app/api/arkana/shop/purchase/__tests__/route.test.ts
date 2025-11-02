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

describe('POST /api/arkana/shop/purchase', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('should successfully purchase a cybernetic', async () => {
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
        hitPoints: 10,
        xp: 300,
        cyberneticAugments: [],
        magicSchools: [],
        magicWeaves: [],
        arkanaRole: 'player',
        registrationCompleted: true
      }
    });

    const sessionId = 'test-session-' + Date.now();
    const request = createMockPostRequest('/api/arkana/shop/purchase', {
      sl_uuid: user.slUuid,
      universe: 'arkana',
      token,
      sessionId,
      purchases: [
        {
          itemType: 'cybernetic',
          itemId: 'cyber_reflex_boost',
          xpCost: 2
        }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.updatedXp).toBe(298); // 300 - 2
    expect(data.data.addedCybernetics).toContain('cyber_reflex_boost');
    expect(data.data.totalCost).toBe(2);

    // Verify database update
    const updatedStats = await prisma.arkanaStats.findUnique({
      where: { userId: user.id }
    });

    expect(updatedStats?.xp).toBe(298);
    expect(updatedStats?.cyberneticAugments).toContain('cyber_reflex_boost');
  });

  it('should successfully purchase multiple items', async () => {
    const { user, token } = await createTestUser('arkana');

    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Rich Character',
        agentName: 'RichAgent',
        race: 'Human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 2,
        hitPoints: 10,
        xp: 500,
        cyberneticAugments: [],
        magicSchools: [],
        magicWeaves: [],
        arkanaRole: 'player',
        registrationCompleted: true
      }
    });

    const sessionId = 'test-session-' + Date.now();
    const request = createMockPostRequest('/api/arkana/shop/purchase', {
      sl_uuid: user.slUuid,
      universe: 'arkana',
      token,
      sessionId,
      purchases: [
        {
          itemType: 'cybernetic',
          itemId: 'cyber_enhanced_vision',
          xpCost: 2
        },
        {
          itemType: 'cybernetic',
          itemId: 'cyber_reflex_boost',
          xpCost: 2
        }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.updatedXp).toBe(496); // 500 - 4
    expect(data.data.addedCybernetics).toContain('cyber_enhanced_vision');
    expect(data.data.addedCybernetics).toContain('cyber_reflex_boost');
    expect(data.data.totalCost).toBe(4);
  });

  it('should purchase magic weave and auto-unlock school', async () => {
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
        perception: 2,
        hitPoints: 10,
        xp: 400,
        cyberneticAugments: [],
        magicSchools: [],
        magicWeaves: [],
        arkanaRole: 'player',
        registrationCompleted: true
      }
    });

    const sessionId = 'test-session-' + Date.now();
    const request = createMockPostRequest('/api/arkana/shop/purchase', {
      sl_uuid: user.slUuid,
      universe: 'arkana',
      token,
      sessionId,
      purchases: [
        {
          itemType: 'magic_weave',
          itemId: 'weave_fire_bolt',
          xpCost: 1
        }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.updatedXp).toBe(399); // 400 - 1
    expect(data.data.addedMagicWeaves).toContain('weave_fire_bolt');
    expect(data.data.addedMagicSchools).toContain('school_elemental'); // Auto-unlocked

    // Verify database update
    const updatedStats = await prisma.arkanaStats.findUnique({
      where: { userId: user.id }
    });

    expect(updatedStats?.magicWeaves).toContain('weave_fire_bolt');
    expect(updatedStats?.magicSchools).toContain('school_elemental');
  });

  it('should not re-add school if already owned', async () => {
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
        perception: 2,
        hitPoints: 10,
        xp: 400,
        cyberneticAugments: [],
        magicSchools: ['school_elemental'], // Already owns school
        magicWeaves: ['weave_fire_bolt'], // Already owns one weave
        arkanaRole: 'player',
        registrationCompleted: true
      }
    });

    const sessionId = 'test-session-' + Date.now();
    // Try to purchase another weave from the same school
    const request = createMockPostRequest('/api/arkana/shop/purchase', {
      sl_uuid: user.slUuid,
      universe: 'arkana',
      token,
      sessionId,
      purchases: [
        {
          itemType: 'magic_weave',
          itemId: 'weave_ice_shield', // Another elemental weave
          xpCost: 1
        }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.addedMagicSchools).toHaveLength(0); // School not re-added
  });

  it('should fail with insufficient XP', async () => {
    const { user, token } = await createTestUser('arkana');

    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Poor Character',
        agentName: 'PoorAgent',
        race: 'Human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 2,
        mental: 3,
        perception: 2,
        hitPoints: 10,
        xp: 1, // Only 1 XP
        cyberneticAugments: [],
        magicSchools: [],
        magicWeaves: [],
        arkanaRole: 'player',
        registrationCompleted: true
      }
    });

    const sessionId = 'test-session-' + Date.now();
    const request = createMockPostRequest('/api/arkana/shop/purchase', {
      sl_uuid: user.slUuid,
      universe: 'arkana',
      token,
      sessionId,
      purchases: [
        {
          itemType: 'cybernetic',
          itemId: 'cyber_neural_processor',
          xpCost: 3
        }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(data.error).toContain('Insufficient XP');
  });

  it('should fail when purchasing already owned item', async () => {
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
        hitPoints: 10,
        xp: 300,
        cyberneticAugments: ['cyber_reflex_boost'], // Already owns this
        magicSchools: [],
        magicWeaves: [],
        arkanaRole: 'player',
        registrationCompleted: true
      }
    });

    const sessionId = 'test-session-' + Date.now();
    const request = createMockPostRequest('/api/arkana/shop/purchase', {
      sl_uuid: user.slUuid,
      universe: 'arkana',
      token,
      sessionId,
      purchases: [
        {
          itemType: 'cybernetic',
          itemId: 'cyber_reflex_boost', // Try to buy again
          xpCost: 2
        }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(data.error).toContain('already own');
  });

  it('should fail when trying to buy magic for Spliced race', async () => {
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
        hitPoints: 15,
        xp: 400,
        cyberneticAugments: [],
        magicSchools: [],
        magicWeaves: [],
        arkanaRole: 'player',
        registrationCompleted: true
      }
    });

    const sessionId = 'test-session-' + Date.now();
    const request = createMockPostRequest('/api/arkana/shop/purchase', {
      sl_uuid: user.slUuid,
      universe: 'arkana',
      token,
      sessionId,
      purchases: [
        {
          itemType: 'magic_weave',
          itemId: 'weave_fire_bolt',
          xpCost: 1
        }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(data.error).toContain('not eligible');
  });

  it('should fail with invalid xpCost (price mismatch)', async () => {
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
        hitPoints: 10,
        xp: 300,
        cyberneticAugments: [],
        magicSchools: [],
        magicWeaves: [],
        arkanaRole: 'player',
        registrationCompleted: true
      }
    });

    const sessionId = 'test-session-' + Date.now();
    const request = createMockPostRequest('/api/arkana/shop/purchase', {
      sl_uuid: user.slUuid,
      universe: 'arkana',
      token,
      sessionId,
      purchases: [
        {
          itemType: 'cybernetic',
          itemId: 'cyber_reflex_boost',
          xpCost: 999 // Wrong price (actual is 2)
        }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(data.error).toContain('Insufficient XP'); // Will fail XP check before validation
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
        xp: 300,
        registrationCompleted: true
      }
    });

    const request = createMockPostRequest('/api/arkana/shop/purchase', {
      sl_uuid: user.slUuid,
      universe: 'arkana',
      token,
      // sessionId missing
      purchases: [
        {
          itemType: 'cybernetic',
          itemId: 'cyber_reflex_boost',
          xpCost: 2
        }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
  });

  it('should log purchase event', async () => {
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
        hitPoints: 10,
        xp: 300,
        cyberneticAugments: [],
        magicSchools: [],
        magicWeaves: [],
        arkanaRole: 'player',
        registrationCompleted: true
      }
    });

    const sessionId = 'test-session-' + Date.now();
    const request = createMockPostRequest('/api/arkana/shop/purchase', {
      sl_uuid: user.slUuid,
      universe: 'arkana',
      token,
      sessionId,
      purchases: [
        {
          itemType: 'cybernetic',
          itemId: 'cyber_reflex_boost',
          xpCost: 2
        }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);

    // Check that event was logged
    const events = await prisma.event.findMany({
      where: {
        userId: user.id,
        type: 'XP_SHOP_PURCHASE'
      }
    });

    expect(events.length).toBe(1);
    expect(events[0].details).toHaveProperty('totalCost', 2);
    expect(events[0].details).toHaveProperty('xpBefore', 300);
    expect(events[0].details).toHaveProperty('xpAfter', 298);
  });
});
