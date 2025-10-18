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

  // === SCENE EFFECT DURATION TESTS ===

  it('should NOT decrement scene effects on turn end', async () => {
    const activeEffects: ActiveEffect[] = [
      { effectId: 'buff_stealth_4', name: 'Yin Shroud', duration: 'scene', turnsLeft: 999, appliedAt: new Date().toISOString() }
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
    expect(effects[0].turnsLeft).toBe(999); // Should NOT decrement
    expect(effects[0].duration).toBe('scene');
  });

  it('should handle mixed scene and turn-based effects correctly', async () => {
    const activeEffects: ActiveEffect[] = [
      { effectId: 'buff_stealth_4', name: 'Yin Shroud', duration: 'scene', turnsLeft: 999, appliedAt: new Date().toISOString() },
      { effectId: 'buff_physical_1', name: 'Physical Boost', duration: 'turns:3', turnsLeft: 3, appliedAt: new Date().toISOString() },
      { effectId: 'utility_test_eavesdrop', name: 'Remote Eavesdropping', duration: 'scene', turnsLeft: 999, appliedAt: new Date().toISOString() }
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
    expect(data.data.effectsRemaining).toBe(3);

    const updatedStats = await prisma.arkanaStats.findUnique({ where: { userId: user.id } });
    const effects = updatedStats?.activeEffects as ActiveEffect[];
    expect(effects).toHaveLength(3);

    // Scene effects should remain at 999
    expect(effects.find(e => e.effectId === 'buff_stealth_4')?.turnsLeft).toBe(999);
    expect(effects.find(e => e.effectId === 'utility_test_eavesdrop')?.turnsLeft).toBe(999);

    // Turn-based effects should decrement
    expect(effects.find(e => e.effectId === 'buff_physical_1')?.turnsLeft).toBe(2);
  });

  it('should keep scene effects through multiple turn ends', async () => {
    const activeEffects: ActiveEffect[] = [
      { effectId: 'buff_stealth_4', name: 'Yin Shroud', duration: 'scene', turnsLeft: 999, appliedAt: new Date().toISOString() }
    ];

    const { user } = await createArkanaTestUser({ activeEffects });

    const timestamp1 = new Date().toISOString();
    const signature1 = generateSignature(timestamp1, 'arkana');

    // First turn end
    let params = {
      player_uuid: user.slUuid,
      universe: 'arkana',
      timestamp: timestamp1,
      signature: signature1
    };

    let request = createMockPostRequest('/api/arkana/combat/end-turn', params);
    await POST(request);

    // Second turn end
    const timestamp2 = new Date(Date.now() + 1000).toISOString();
    const signature2 = generateSignature(timestamp2, 'arkana');

    params = {
      player_uuid: user.slUuid,
      universe: 'arkana',
      timestamp: timestamp2,
      signature: signature2
    };

    request = createMockPostRequest('/api/arkana/combat/end-turn', params);
    await POST(request);

    // Third turn end
    const timestamp3 = new Date(Date.now() + 2000).toISOString();
    const signature3 = generateSignature(timestamp3, 'arkana');

    params = {
      player_uuid: user.slUuid,
      universe: 'arkana',
      timestamp: timestamp3,
      signature: signature3
    };

    request = createMockPostRequest('/api/arkana/combat/end-turn', params);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.effectsRemaining).toBe(1);

    const updatedStats = await prisma.arkanaStats.findUnique({ where: { userId: user.id } });
    const effects = updatedStats?.activeEffects as ActiveEffect[];
    expect(effects).toHaveLength(1);
    expect(effects[0].turnsLeft).toBe(999); // Still 999 after 3 turn ends
  });

  it('should format scene effects as "scene" in liveStatsString after turn end', async () => {
    const { loadAllData } = await import('@/lib/arkana/dataLoader');
    await loadAllData();

    const { formatLiveStatsForLSL } = await import('@/lib/arkana/effectsUtils');

    const activeEffects: ActiveEffect[] = [
      { effectId: 'buff_stealth_4', name: 'Yin Shroud', duration: 'scene', turnsLeft: 999, appliedAt: new Date().toISOString(), casterName: 'TestUser' }
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
    await POST(request);

    // Get updated effects and format them
    const updatedStats = await prisma.arkanaStats.findUnique({ where: { userId: user.id } });
    const effects = updatedStats?.activeEffects as ActiveEffect[];
    const liveStats = updatedStats?.liveStats as LiveStats;

    const formatted = formatLiveStatsForLSL(liveStats, effects);
    const decoded = decodeURIComponent(formatted);

    // Should still display as "scene" not "999 turns left"
    expect(decoded).toContain('scene');
    expect(decoded).not.toContain('999 turns left');
  });

  it('should expire turn-based effects while preserving scene effects', async () => {
    const activeEffects: ActiveEffect[] = [
      { effectId: 'buff_stealth_4', name: 'Yin Shroud', duration: 'scene', turnsLeft: 999, appliedAt: new Date().toISOString() },
      { effectId: 'buff_mental_1_turn', name: 'Mental Boost', duration: 'turns:1', turnsLeft: 1, appliedAt: new Date().toISOString() }
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
    expect(data.data.effectsRemaining).toBe(1); // Only scene effect remains

    const updatedStats = await prisma.arkanaStats.findUnique({ where: { userId: user.id } });
    const effects = updatedStats?.activeEffects as ActiveEffect[];
    expect(effects).toHaveLength(1);
    expect(effects[0].effectId).toBe('buff_stealth_4');
    expect(effects[0].turnsLeft).toBe(999);
  });

  it('should preserve multiple different scene effects without decrementing', async () => {
    const activeEffects: ActiveEffect[] = [
      { effectId: 'buff_stealth_4', name: 'Yin Shroud', duration: 'scene', turnsLeft: 999, appliedAt: new Date().toISOString(), casterName: 'Alice' },
      { effectId: 'utility_test_eavesdrop', name: 'Remote Eavesdropping', duration: 'scene', turnsLeft: 999, appliedAt: new Date().toISOString(), casterName: 'Bob' },
      { effectId: 'special_test_shadowform', name: 'Shadowform', duration: 'scene', turnsLeft: 999, appliedAt: new Date().toISOString(), casterName: 'Charlie' }
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
    expect(data.data.effectsRemaining).toBe(3);

    const updatedStats = await prisma.arkanaStats.findUnique({ where: { userId: user.id } });
    const effects = updatedStats?.activeEffects as ActiveEffect[];
    expect(effects).toHaveLength(3);

    // All scene effects should remain at 999
    effects.forEach(effect => {
      expect(effect.turnsLeft).toBe(999);
      expect(effect.duration).toBe('scene');
    });
  });
});
