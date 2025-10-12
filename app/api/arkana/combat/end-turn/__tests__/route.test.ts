import { POST } from '../route';
import { prisma } from '@/lib/prisma';
import { createMockPostRequest, parseJsonResponse, expectSuccess, expectError, createTestUser } from '@/__tests__/utils/test-helpers';
import { arkanaEndTurnSchema } from '@/lib/validation';
import { recalculateLiveStats } from '@/lib/arkana/effectsUtils';
import { generateSignature } from '@/lib/signature';
import type { ActiveEffect, LiveStats, ArkanaStats } from '@/lib/arkana/types';

async function createArkanaTestUser(arkanaStatsData: {
  physical?: number;
  dexterity?: number;
  mental?: number;
  perception?: number;
  hitPoints?: number;
  activeEffects?: ActiveEffect[];
  liveStats?: LiveStats;
  status?: number;
  health?: number;
}) {
  const { user } = await createTestUser('arkana');

  // Auto-calculate liveStats if activeEffects provided and liveStats not
  let calculatedLiveStats = arkanaStatsData.liveStats;
  if (arkanaStatsData.activeEffects && arkanaStatsData.activeEffects.length > 0 && !arkanaStatsData.liveStats) {
    const { loadAllData } = await import('@/lib/arkana/dataLoader');
    await loadAllData();
    const tempStats = {
      physical: arkanaStatsData.physical || 3,
      mental: arkanaStatsData.mental || 3,
      dexterity: arkanaStatsData.dexterity || 3,
      perception: arkanaStatsData.perception || 3,
    } as ArkanaStats;
    calculatedLiveStats = recalculateLiveStats(tempStats, arkanaStatsData.activeEffects);
  }

  // Create userStats (global createTestUser doesn't create it for arkana universe)
  await prisma.userStats.create({
    data: {
      userId: user.id,
      health: arkanaStatsData.health ?? 100,
      hunger: 100,
      thirst: 100,
      status: arkanaStatsData.status ?? 0,
      goldCoin: 0,
      silverCoin: 0,
      copperCoin: 0
    }
  });

  const arkanaStats = await prisma.arkanaStats.create({
    data: {
      userId: user.id,
      characterName: 'TestCharacter',
      agentName: 'TestAgent',
      race: 'human',
      archetype: 'Arcanist',
      physical: arkanaStatsData.physical || 3,
      dexterity: arkanaStatsData.dexterity || 3,
      mental: arkanaStatsData.mental || 3,
      perception: arkanaStatsData.perception || 3,
      hitPoints: arkanaStatsData.hitPoints || 100,
      statPointsPool: 0,
      statPointsSpent: 6,
      flaws: ['flaw_addiction'],
      flawPointsGranted: 3,
      powerPointsBudget: 15,
      powerPointsBonus: 3,
      powerPointsSpent: 0,
      credits: 1000,
      chips: 500,
      xp: 0,
      registrationCompleted: true,
      activeEffects: arkanaStatsData.activeEffects || [],
      liveStats: calculatedLiveStats || {}
    }
  });

  return { user, arkanaStats };
}

describe('POST /api/arkana/combat/end-turn', () => {
  beforeEach(async () => {
    await prisma.arkanaStats.deleteMany({});
    await prisma.userStats.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.arkanaStats.deleteMany({});
    await prisma.userStats.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.$disconnect();
  });

  it('should validate required fields', async () => {
    const { error } = arkanaEndTurnSchema.validate({});
    expect(error).toBeDefined();
  });

  it('should successfully end turn with no effects', async () => {
    const { user } = await createArkanaTestUser({ activeEffects: [] });

    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'arkana');

    const params = {
      player_uuid: user.slUuid,
      universe: 'arkana',
      timestamp,
      signature
    };

    const request = createMockPostRequest('/api/arkana/combat/end-turn', params);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.effectsRemaining).toBe(0);

    const updatedStats = await prisma.arkanaStats.findUnique({ where: { userId: user.id } });
    expect(updatedStats?.activeEffects).toEqual([]);
  });

  it('should end turn and decrement effect turns by 1', async () => {
    const activeEffects: ActiveEffect[] = [
      { effectId: 'buff_physical_1', name: 'Physical Boost', duration: 'turns:3', turnsLeft: 3, appliedAt: new Date().toISOString() }
    ];

    const { user } = await createArkanaTestUser({ activeEffects });

    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'arkana');

    const params = {
      player_uuid: user.slUuid,
      universe: 'arkana',
      timestamp,
      signature
    };

    const request = createMockPostRequest('/api/arkana/combat/end-turn', params);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.effectsRemaining).toBe(1);

    const updatedStats = await prisma.arkanaStats.findUnique({ where: { userId: user.id } });
    const effects = updatedStats?.activeEffects as ActiveEffect[];
    expect(effects).toHaveLength(1);
    expect(effects[0].turnsLeft).toBe(2);
  });

  it('should remove effects when turnsLeft reaches 0', async () => {
    const activeEffects: ActiveEffect[] = [
      { effectId: 'buff_physical_1', name: 'Physical Boost', duration: 'turns:1', turnsLeft: 1, appliedAt: new Date().toISOString() }
    ];

    const { user } = await createArkanaTestUser({ activeEffects });

    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'arkana');

    const params = {
      player_uuid: user.slUuid,
      universe: 'arkana',
      timestamp,
      signature
    };

    const request = createMockPostRequest('/api/arkana/combat/end-turn', params);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.effectsRemaining).toBe(0);

    const updatedStats = await prisma.arkanaStats.findUnique({ where: { userId: user.id } });
    expect(updatedStats?.activeEffects).toEqual([]);
  });

  it('should handle multiple effects correctly', async () => {
    const activeEffects: ActiveEffect[] = [
      { effectId: 'buff_physical_1', name: 'Physical Boost', duration: 'turns:3', turnsLeft: 3, appliedAt: new Date().toISOString() },
      { effectId: 'buff_mental_1_turn', name: 'Mental Boost', duration: 'turns:1', turnsLeft: 1, appliedAt: new Date().toISOString() },
      { effectId: 'buff_dexterity_3', name: 'Dex Boost', duration: 'turns:5', turnsLeft: 5, appliedAt: new Date().toISOString() }
    ];

    const { user } = await createArkanaTestUser({ activeEffects });

    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'arkana');

    const params = {
      player_uuid: user.slUuid,
      universe: 'arkana',
      timestamp,
      signature
    };

    const request = createMockPostRequest('/api/arkana/combat/end-turn', params);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.effectsRemaining).toBe(2); // One expired

    const updatedStats = await prisma.arkanaStats.findUnique({ where: { userId: user.id } });
    const effects = updatedStats?.activeEffects as ActiveEffect[];
    expect(effects).toHaveLength(2);
    expect(effects.find(e => e.effectId === 'buff_physical_1')?.turnsLeft).toBe(2);
    expect(effects.find(e => e.effectId === 'buff_dexterity_3')?.turnsLeft).toBe(4);
  });

  it('should return 404 for non-existent player', async () => {
    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'arkana');

    const params = {
      player_uuid: 'a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d',
      universe: 'arkana',
      timestamp,
      signature
    };

    const request = createMockPostRequest('/api/arkana/combat/end-turn', params);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(404);
    expect(data.error).toContain('not found');
  });

  it('should reject if registration not completed', async () => {
    const { user } = await createTestUser('arkana');

    await prisma.arkanaStats.create({
      data: {
        userId: user.id,
        characterName: 'Incomplete',
        agentName: 'Agent',
        race: 'human',
        physical: 3,
        dexterity: 3,
        mental: 3,
        perception: 3,
        hitPoints: 100,
        statPointsPool: 0,
        statPointsSpent: 6,
        credits: 0,
        chips: 0,
        xp: 0,
        registrationCompleted: false
      }
    });

    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'arkana');

    const params = {
      player_uuid: user.slUuid,
      universe: 'arkana',
      timestamp,
      signature
    };

    const request = createMockPostRequest('/api/arkana/combat/end-turn', params);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
    expect(data.error).toContain('registration incomplete');
  });

  it('should reject if player not in RP mode', async () => {
    const { user } = await createArkanaTestUser({ status: 1 }); // OOC mode

    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'arkana');

    const params = {
      player_uuid: user.slUuid,
      universe: 'arkana',
      timestamp,
      signature
    };

    const request = createMockPostRequest('/api/arkana/combat/end-turn', params);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(400);
    expect(data.error).toContain('not in RP mode');
  });

  it('should reject invalid signature', async () => {
    const { user } = await createArkanaTestUser({});

    const params = {
      player_uuid: user.slUuid,
      universe: 'arkana',
      timestamp: new Date().toISOString(),
      signature: 'a'.repeat(64) // Valid format but wrong signature
    };

    const request = createMockPostRequest('/api/arkana/combat/end-turn', params);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(401);
  });
});
