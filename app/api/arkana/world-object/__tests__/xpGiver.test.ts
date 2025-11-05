import { POST } from '../perform-action/route';
import {
  createMockPostRequest,
  createTestUser,
  cleanupDatabase,
  parseJsonResponse,
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { prisma } from '@/lib/prisma';
import { generateSignature } from '@/lib/signature';

describe('/api/arkana/world-object/perform-action - XP Giver (event_gate + successScript)', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  /**
   * Helper: Create Arkana test user with basic stats
   */
  async function createArkanaTestUser(arkanaStatsData: {
    characterName: string;
    race: string;
    archetype: string;
    physical: number;
    dexterity: number;
    mental: number;
    perception: number;
    maxHP: number;
    xp?: number;
    status?: number;
  }) {
    const { user } = await createTestUser('arkana');

    // Create user stats with RP mode
    await prisma.userStats.create({
      data: {
        userId: user.id,
        health: 100,
        hunger: 100,
        thirst: 100,
        copperCoin: 100,
        status: arkanaStatsData.status !== undefined ? arkanaStatsData.status : 0
      }
    });

    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        agentName: user.username + ' Resident',
        registrationCompleted: true,
        characterName: arkanaStatsData.characterName,
        race: arkanaStatsData.race,
        archetype: arkanaStatsData.archetype,
        physical: arkanaStatsData.physical,
        dexterity: arkanaStatsData.dexterity,
        mental: arkanaStatsData.mental,
        perception: arkanaStatsData.perception,
        maxHP: arkanaStatsData.hitPoints,
        xp: arkanaStatsData.xp || 0,
        skills: [],
        activeEffects: [],
        liveStats: {}
      }
    });

    return user;
  }

  /**
   * Helper: Create XP Giver WorldObject
   */
  async function createXpGiverObject() {
    return await prisma.worldObject.create({
      data: {
        objectId: 'XP_GIVER_TEST_001',
        universe: 'arkana',
        name: 'Test XP Crystal',
        description: 'Test crystal that grants XP',
        location: 'Test Area',
        type: 'xp_giver',
        state: 'Active',
        owners: [],
        actions: [
          {
            action: 'Get XP',
            showStates: 'Active',
            checks: 'check_player_used_action_once',
            successScript: 'increase_player_xp_by_one',
            successState: 'Active',
            notify: 'private'
          }
        ],
        stats: {},
        groups: []
      }
    });
  }

  /**
   * Helper: Create request with signature
   */
  function createSignedRequest(playerUuid: string, objectId: string, actionId: string) {
    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'arkana');

    return createMockPostRequest('/api/arkana/world-object/perform-action', {
      playerUuid,
      objectId,
      actionId,
      universe: 'arkana',
      timestamp,
      signature
    });
  }

  it('should successfully grant XP on first use', async () => {
    const user = await createArkanaTestUser({
      characterName: 'Test Player',
      race: 'Human',
      archetype: 'Arcanist',
      physical: 2,
      dexterity: 2,
      mental: 3,
      perception: 2,
      maxHP: 10,
      xp: 0
    });

    const worldObject = await createXpGiverObject();
    const request = createSignedRequest(user.slUuid, worldObject.objectId, 'Get XP');

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.actionSuccess).toBe('true');
    expect(decodeURIComponent(data.data.message)).toContain('Gained 1 XP');

    // Verify XP was incremented
    const updatedStats = await prisma.arkanaStats.findFirst({
      where: { userId: user.id }
    });
    expect(updatedStats?.xp).toBe(1);

    // Verify event was created
    const event = await prisma.event.findFirst({
      where: {
        userId: user.id,
        type: 'WORLD_OBJECT_ACTION_USED'
      }
    });
    expect(event).toBeDefined();
    const details = event?.details as Record<string, unknown>;
    expect(details?.objectId).toBe(worldObject.objectId);
    expect(details?.actionId).toBe('Get XP');
  });

  it('should fail on second attempt (already collected)', async () => {
    const user = await createArkanaTestUser({
      characterName: 'Test Player',
      race: 'Human',
      archetype: 'Arcanist',
      physical: 2,
      dexterity: 2,
      mental: 3,
      perception: 2,
      maxHP: 10,
      xp: 0
    });

    const worldObject = await createXpGiverObject();

    // First attempt - success
    const request1 = createSignedRequest(user.slUuid, worldObject.objectId, 'Get XP');
    const response1 = await POST(request1);
    const data1 = await parseJsonResponse(response1);

    expect(data1.success).toBe(true);
    expect(data1.data.actionSuccess).toBe('true');

    // Second attempt - should fail
    const request2 = createSignedRequest(user.slUuid, worldObject.objectId, 'Get XP');
    const response2 = await POST(request2);
    const data2 = await parseJsonResponse(response2);

    expect(response2.status).toBe(200);
    expect(data2.success).toBe(true);
    expect(data2.data.actionSuccess).toBe('false');
    expect(decodeURIComponent(data2.data.message)).toContain('already collected XP');

    // Verify XP was NOT incremented again
    const updatedStats = await prisma.arkanaStats.findFirst({
      where: { userId: user.id }
    });
    expect(updatedStats?.xp).toBe(1); // Still 1, not 2

    // Verify only ONE event exists
    const events = await prisma.event.findMany({
      where: {
        userId: user.id,
        type: 'WORLD_OBJECT_ACTION_USED'
      }
    });
    expect(events).toHaveLength(1);
  });

  it('should allow different players to collect XP from same object', async () => {
    const user1 = await createArkanaTestUser({
      characterName: 'Player One',
      race: 'Human',
      archetype: 'Arcanist',
      physical: 2,
      dexterity: 2,
      mental: 3,
      perception: 2,
      maxHP: 10,
      xp: 0
    });

    const user2 = await createArkanaTestUser({
      characterName: 'Player Two',
      race: 'Human',
      archetype: 'Psion',
      physical: 2,
      dexterity: 2,
      mental: 4,
      perception: 2,
      maxHP: 10,
      xp: 0
    });

    const worldObject = await createXpGiverObject();

    // Player 1 collects
    const request1 = createSignedRequest(user1.slUuid, worldObject.objectId, 'Get XP');
    const response1 = await POST(request1);
    const data1 = await parseJsonResponse(response1);

    expect(data1.success).toBe(true);
    expect(data1.data.actionSuccess).toBe('true');

    // Player 2 collects
    const request2 = createSignedRequest(user2.slUuid, worldObject.objectId, 'Get XP');
    const response2 = await POST(request2);
    const data2 = await parseJsonResponse(response2);

    expect(data2.success).toBe(true);
    expect(data2.data.actionSuccess).toBe('true');

    // Verify both players have XP
    const stats1 = await prisma.arkanaStats.findFirst({ where: { userId: user1.id } });
    const stats2 = await prisma.arkanaStats.findFirst({ where: { userId: user2.id } });

    expect(stats1?.xp).toBe(1);
    expect(stats2?.xp).toBe(1);

    // Verify both events exist
    const events = await prisma.event.findMany({
      where: { type: 'WORLD_OBJECT_ACTION_USED' }
    });
    expect(events).toHaveLength(2);
  });

  it('should maintain object state as Active after XP collection', async () => {
    const user = await createArkanaTestUser({
      characterName: 'Test Player',
      race: 'Human',
      archetype: 'Arcanist',
      physical: 2,
      dexterity: 2,
      mental: 3,
      perception: 2,
      maxHP: 10,
      xp: 0
    });

    const worldObject = await createXpGiverObject();
    const request = createSignedRequest(user.slUuid, worldObject.objectId, 'Get XP');

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(data.data.objectState).toBe('Active');

    // Verify state in database
    const updatedObject = await prisma.worldObject.findUnique({
      where: { id: worldObject.id }
    });
    expect(updatedObject?.state).toBe('Active');
  });

  it('should fail if player is not in RP mode', async () => {
    const user = await createArkanaTestUser({
      characterName: 'Test Player',
      race: 'Human',
      archetype: 'Arcanist',
      physical: 2,
      dexterity: 2,
      mental: 3,
      perception: 2,
      maxHP: 10,
      xp: 0,
      status: 1 // NOT in RP mode
    });

    const worldObject = await createXpGiverObject();
    const request = createSignedRequest(user.slUuid, worldObject.objectId, 'Get XP');

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('not in RP mode');
  });

  it('should work with XP accumulation', async () => {
    const user = await createArkanaTestUser({
      characterName: 'Test Player',
      race: 'Human',
      archetype: 'Arcanist',
      physical: 2,
      dexterity: 2,
      mental: 3,
      perception: 2,
      maxHP: 10,
      xp: 50 // Already has some XP
    });

    const worldObject = await createXpGiverObject();
    const request = createSignedRequest(user.slUuid, worldObject.objectId, 'Get XP');

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(data.data.actionSuccess).toBe('true');

    // Verify XP was added to existing amount
    const updatedStats = await prisma.arkanaStats.findFirst({
      where: { userId: user.id }
    });
    expect(updatedStats?.xp).toBe(51); // 50 + 1
  });
});
