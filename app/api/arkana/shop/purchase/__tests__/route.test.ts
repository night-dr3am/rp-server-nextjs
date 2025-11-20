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
        maxHP: 10,
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

  it('should purchase magic weave with school', async () => {
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
        maxHP: 10,
        xp: 400,
        cyberneticAugments: [],
        magicSchools: ['school_elemental'], // Already owns school
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
    expect(data.data.addedMagicSchools).toHaveLength(0); // School not re-added

    // Verify database update
    const updatedStats = await prisma.arkanaStats.findUnique({
      where: { userId: user.id }
    });

    expect(updatedStats?.magicWeaves).toContain('weave_fire_bolt');
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
        maxHP: 10,
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
        maxHP: 10,
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
        maxHP: 10,
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
        maxHP: 15,
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
        maxHP: 10,
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
        maxHP: 10,
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
        maxHP: 10,
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

  it('should successfully purchase a magic school', async () => {
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
        maxHP: 10,
        xp: 100,
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
          itemType: 'magic_school',
          itemId: 'school_elemental',
          xpCost: 3 // School costs 3 XP in test data
        }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.updatedXp).toBe(97); // 100 - 3
    expect(data.data.addedMagicSchools).toContain('school_elemental');
    expect(data.data.addedMagicWeaves).toHaveLength(0);
    expect(data.data.totalCost).toBe(3);

    // Verify database update
    const updatedStats = await prisma.arkanaStats.findUnique({
      where: { userId: user.id }
    });

    expect(updatedStats?.xp).toBe(97);
    expect(updatedStats?.magicSchools).toContain('school_elemental');
  });

  it('should purchase school and weave together', async () => {
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
        maxHP: 10,
        xp: 100,
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
          itemType: 'magic_school',
          itemId: 'school_elemental',
          xpCost: 3 // School costs 3 XP
        },
        {
          itemType: 'magic_weave',
          itemId: 'weave_fire_bolt',
          xpCost: 1 // Weave costs 1 XP
        }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.updatedXp).toBe(96); // 100 - 4
    expect(data.data.addedMagicSchools).toContain('school_elemental');
    expect(data.data.addedMagicWeaves).toContain('weave_fire_bolt');
    expect(data.data.totalCost).toBe(4);
  });

  it('should fail when buying weave without owning/purchasing school', async () => {
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
        maxHP: 10,
        xp: 100,
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
    expect(data.error).toContain('must purchase the required magic school');
  });

  it('should fail when purchasing already owned school', async () => {
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
        maxHP: 10,
        xp: 100,
        cyberneticAugments: [],
        magicSchools: ['school_elemental'], // Already owns this
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
          itemType: 'magic_school',
          itemId: 'school_elemental',
          xpCost: 3 // School costs 3 XP
        }
      ]
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(data.error).toContain('already own this magic school');
  });

  it('should allow weave purchase when school is owned', async () => {
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
        maxHP: 10,
        xp: 100,
        cyberneticAugments: [],
        magicSchools: ['school_elemental'], // Already owns school
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
    expect(data.data.updatedXp).toBe(99);
    expect(data.data.addedMagicWeaves).toContain('weave_fire_bolt');
    // School should NOT be added again
    expect(data.data.addedMagicSchools).toHaveLength(0);
  });

  // Cybernetic Slot Purchase Tests
  describe('cybernetic slot purchases', () => {
    it('should successfully purchase cybernetic slots', async () => {
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
          xp: 100,
          cyberneticAugments: [],
          cyberneticsSlots: 2,
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
            itemType: 'cybernetic_slot',
            itemId: 'cybernetic_slots',
            xpCost: 3,
            quantity: 3
          }
        ]
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.updatedXp).toBe(97); // 100 - 3
      expect(data.data.addedSlots).toBe(3);
      expect(data.data.totalCost).toBe(3);

      // Verify database update
      const updatedStats = await prisma.arkanaStats.findUnique({
        where: { userId: user.id }
      });

      expect(updatedStats?.xp).toBe(97);
      expect(updatedStats?.cyberneticsSlots).toBe(5); // 2 + 3
    });

    it('should purchase slots and cybernetics together', async () => {
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
          xp: 200,
          cyberneticAugments: [],
          cyberneticsSlots: 1, // Only 1 slot available
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
            itemType: 'cybernetic_slot',
            itemId: 'cybernetic_slots',
            xpCost: 2,
            quantity: 2 // Buy 2 more slots (total will be 3)
          },
          {
            itemType: 'cybernetic',
            itemId: 'cyber_reflex_boost',
            xpCost: 2
          },
          {
            itemType: 'cybernetic',
            itemId: 'cyber_enhanced_vision',
            xpCost: 2
          }
        ]
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.updatedXp).toBe(194); // 200 - 6
      expect(data.data.addedSlots).toBe(2);
      expect(data.data.addedCybernetics).toHaveLength(2);
      expect(data.data.totalCost).toBe(6);

      // Verify database update
      const updatedStats = await prisma.arkanaStats.findUnique({
        where: { userId: user.id }
      });

      expect(updatedStats?.cyberneticsSlots).toBe(3); // 1 + 2
      expect(updatedStats?.cyberneticAugments).toHaveLength(2);
    });

    it('should fail when exceeding max slot limit of 20', async () => {
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
          xp: 100,
          cyberneticAugments: [],
          cyberneticsSlots: 18, // Already at 18
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
            itemType: 'cybernetic_slot',
            itemId: 'cybernetic_slots',
            xpCost: 5,
            quantity: 5 // Would exceed 20
          }
        ]
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(data.error).toContain('Cannot purchase');
      expect(data.error).toContain('Maximum is 20');
    });

    it('should fail when cybernetics exceed available slots', async () => {
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
          xp: 200,
          cyberneticAugments: ['cyber_neural_processor'], // 1 already used
          cyberneticsSlots: 2, // Only 2 slots total
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
          },
          {
            itemType: 'cybernetic',
            itemId: 'cyber_enhanced_vision',
            xpCost: 2
          }
        ]
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(data.error).toContain('Not enough cybernetic slots');
    });

    it('should fail with invalid slot cost', async () => {
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
          xp: 100,
          cyberneticAugments: [],
          cyberneticsSlots: 2,
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
            itemType: 'cybernetic_slot',
            itemId: 'cybernetic_slots',
            xpCost: 10, // Should be 3 for 3 slots
            quantity: 3
          }
        ]
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data);
      expect(data.error).toContain('Invalid slot cost');
    });

    it('should log slot purchase in event', async () => {
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
          xp: 100,
          cyberneticAugments: [],
          cyberneticsSlots: 2,
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
            itemType: 'cybernetic_slot',
            itemId: 'cybernetic_slots',
            xpCost: 2,
            quantity: 2
          }
        ]
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Check that event was logged with slot info
      const events = await prisma.event.findMany({
        where: {
          userId: user.id,
          type: 'XP_SHOP_PURCHASE'
        }
      });

      expect(events.length).toBe(1);
      expect(events[0].details).toHaveProperty('addedSlots', 2);
      expect(events[0].details).toHaveProperty('totalCost', 2);
    });
  });
});
