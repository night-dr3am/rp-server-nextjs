import { POST } from '../route';
import { prisma } from '@/lib/prisma';
import { createMockPostRequest, parseJsonResponse, expectSuccess, expectError, createTestUser } from '@/__tests__/utils/test-helpers';
import { arkanaEndSceneSchema } from '@/lib/validation';
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
      maxHP: arkanaStatsData.hitPoints || 100,
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

describe('POST /api/arkana/combat/end-scene', () => {
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
    const { error } = arkanaEndSceneSchema.validate({});
    expect(error).toBeDefined();
  });

  it('should successfully end scene with no effects', async () => {
    const { user } = await createArkanaTestUser({ activeEffects: [] });

    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'arkana');

    const params = {
      player_uuid: user.slUuid,
      universe: 'arkana',
      timestamp,
      signature
    };

    const request = createMockPostRequest('/api/arkana/combat/end-scene', params);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.effectsRemoved).toBe(0);
    expect(data.data.effectsRemaining).toBe(0);

    const updatedStats = await prisma.arkanaStats.findUnique({ where: { userId: user.id } });
    expect(updatedStats?.activeEffects).toEqual([]);
  });

  it('should clear all turn-based effects', async () => {
    const activeEffects: ActiveEffect[] = [
      { effectId: 'buff_physical_1', name: 'Physical Boost', duration: 'turns:3', turnsLeft: 3, appliedAt: new Date().toISOString() },
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

    const request = createMockPostRequest('/api/arkana/combat/end-scene', params);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.effectsRemoved).toBe(2);
    expect(data.data.effectsRemaining).toBe(0);

    const updatedStats = await prisma.arkanaStats.findUnique({ where: { userId: user.id } });
    expect(updatedStats?.activeEffects).toEqual([]);
  });

  it('should clear all scene-based effects', async () => {
    const activeEffects: ActiveEffect[] = [
      { effectId: 'buff_attack_2', name: 'Scene Buff', duration: 'scene', turnsLeft: 999, appliedAt: new Date().toISOString() }
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

    const request = createMockPostRequest('/api/arkana/combat/end-scene', params);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.effectsRemoved).toBe(1);
    expect(data.data.effectsRemaining).toBe(0);

    const updatedStats = await prisma.arkanaStats.findUnique({ where: { userId: user.id } });
    expect(updatedStats?.activeEffects).toEqual([]);
  });

  it('should keep permanent effects', async () => {
    // Note: This test assumes permanent effects exist in effects.json
    // Since permanent effects are rare, we'll test mixed scenario
    const activeEffects: ActiveEffect[] = [
      { effectId: 'buff_physical_1', name: 'Turn Buff', duration: 'turns:3', turnsLeft: 3, appliedAt: new Date().toISOString() },
      { effectId: 'buff_attack_2', name: 'Scene Buff', duration: 'scene', turnsLeft: 999, appliedAt: new Date().toISOString() }
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

    const request = createMockPostRequest('/api/arkana/combat/end-scene', params);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.effectsRemoved).toBe(2);
    expect(data.data.effectsRemaining).toBe(0);
  });

  it('should handle mixed effect durations correctly', async () => {
    const activeEffects: ActiveEffect[] = [
      { effectId: 'buff_physical_1', name: 'Turn 1', duration: 'turns:3', turnsLeft: 3, appliedAt: new Date().toISOString() },
      { effectId: 'buff_mental_1_turn', name: 'Turn 2', duration: 'turns:1', turnsLeft: 1, appliedAt: new Date().toISOString() },
      { effectId: 'buff_attack_2', name: 'Scene 1', duration: 'scene', turnsLeft: 999, appliedAt: new Date().toISOString() }
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

    const request = createMockPostRequest('/api/arkana/combat/end-scene', params);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectSuccess(data);
    expect(data.data.effectsRemoved).toBe(3);
    expect(data.data.effectsRemaining).toBe(0);

    const updatedStats = await prisma.arkanaStats.findUnique({ where: { userId: user.id } });
    expect(updatedStats?.activeEffects).toEqual([]);
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

    const request = createMockPostRequest('/api/arkana/combat/end-scene', params);
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
        maxHP: 100,
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

    const request = createMockPostRequest('/api/arkana/combat/end-scene', params);
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

    const request = createMockPostRequest('/api/arkana/combat/end-scene', params);
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

    const request = createMockPostRequest('/api/arkana/combat/end-scene', params);
    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expectError(data);
    expect(response.status).toBe(401);
  });

  // Health Modifier Tests (stat_value affects maxHP)
  describe('Health Modifier Effects (maxHP Changes on Scene End)', () => {
    it('should decrease maxHP when scene-long Health stat_value effect clears', async () => {
      // Start with physical: 3 (base maxHP = 15)
      // Apply scene-long Health +10 effect
      const activeEffects: ActiveEffect[] = [
        { effectId: 'buff_health_stat_10', name: 'Constitution Enhancement +10', duration: 'scene', turnsLeft: 999, appliedAt: new Date().toISOString() }
      ];

      const { user } = await createArkanaTestUser({ physical: 3, activeEffects, health: 23 });

      // Manually update maxHP to 25 (15 base + 10 from Health effect)
      await prisma.arkanaStats.update({
        where: { userId: user.id },
        data: { maxHP: 25 }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const params = {
        player_uuid: user.slUuid,
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/end-scene', params);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsRemoved).toBe(1);
      expect(data.data.effectsRemaining).toBe(0);

      // Verify maxHP decreased back to 15 (scene effect cleared)
      const updatedStats = await prisma.arkanaStats.findUnique({ where: { userId: user.id } });
      expect(updatedStats?.maxHP).toBe(15);

      // Verify current HP was capped at 15 (was 23, but new maxHP is 15)
      const updatedUserStats = await prisma.userStats.findUnique({ where: { userId: user.id } });
      expect(updatedUserStats?.health).toBe(15);

      // Verify liveStats.Health is cleared
      const liveStats = updatedStats?.liveStats as LiveStats;
      expect(liveStats.Health).toBeUndefined();
    });

    it('should cap health when maxHP decreases due to scene Health effect clearing', async () => {
      // Start with physical: 3 (base maxHP = 15)
      // Apply scene-long Health +10 effect, current HP at new maxHP
      const activeEffects: ActiveEffect[] = [
        { effectId: 'buff_health_stat_10', name: 'Constitution Enhancement +10', duration: 'scene', turnsLeft: 999, appliedAt: new Date().toISOString() }
      ];

      const { user } = await createArkanaTestUser({ physical: 3, activeEffects, health: 25 });

      // Manually update maxHP to 25 (15 base + 10 from Health effect)
      await prisma.arkanaStats.update({
        where: { userId: user.id },
        data: { maxHP: 25 }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const params = {
        player_uuid: user.slUuid,
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/end-scene', params);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsRemoved).toBe(1);

      // Verify maxHP decreased back to 15 (scene effect cleared)
      const updatedStats = await prisma.arkanaStats.findUnique({ where: { userId: user.id } });
      expect(updatedStats?.maxHP).toBe(15);

      // Verify current HP was capped at 15 (was 25, but new maxHP is 15)
      const updatedUserStats = await prisma.userStats.findUnique({ where: { userId: user.id } });
      expect(updatedUserStats?.health).toBe(15);
    });

    it('should clear multiple Health effects with mixed durations', async () => {
      // Start with physical: 3 (base maxHP = 15)
      // Apply scene-long Health +10 and turn-based Health +5
      const activeEffects: ActiveEffect[] = [
        { effectId: 'buff_health_stat_10', name: 'Constitution Enhancement +10', duration: 'scene', turnsLeft: 999, appliedAt: new Date().toISOString() },
        { effectId: 'buff_health_stat_5', name: 'Fortitude Boost +5', duration: 'turns:2', turnsLeft: 2, appliedAt: new Date().toISOString() }
      ];

      const { user } = await createArkanaTestUser({ physical: 3, activeEffects, health: 28 });

      // Manually update maxHP to 30 (15 base + 10 + 5 from Health effects)
      await prisma.arkanaStats.update({
        where: { userId: user.id },
        data: { maxHP: 30 }
      });

      const timestamp = new Date().toISOString();
      const signature = generateSignature(timestamp, 'arkana');

      const params = {
        player_uuid: user.slUuid,
        universe: 'arkana',
        timestamp,
        signature
      };

      const request = createMockPostRequest('/api/arkana/combat/end-scene', params);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.effectsRemoved).toBe(2); // Both effects cleared

      // Verify maxHP decreased back to 15 (all scene/turn effects cleared)
      const updatedStats = await prisma.arkanaStats.findUnique({ where: { userId: user.id } });
      expect(updatedStats?.maxHP).toBe(15);

      // Verify current HP was capped at 15 (was 28, but new maxHP is 15)
      const updatedUserStats = await prisma.userStats.findUnique({ where: { userId: user.id } });
      expect(updatedUserStats?.health).toBe(15);

      // Verify liveStats.Health is cleared
      const liveStats = updatedStats?.liveStats as LiveStats;
      expect(liveStats.Health).toBeUndefined();
    });
  });
});

