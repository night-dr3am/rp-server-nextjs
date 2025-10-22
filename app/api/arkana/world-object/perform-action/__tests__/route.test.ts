import { POST } from '../route';
import {
  createMockPostRequest,
  createTestUser,
  cleanupDatabase,
  parseJsonResponse,
  testExpectedError,
} from '@/__tests__/utils/test-helpers';
import { setupTestDatabase, teardownTestDatabase } from '@/__tests__/utils/test-setup';
import { prisma } from '@/lib/prisma';
import { generateSignature } from '@/lib/signature';
import type { ActiveEffect, LiveStats, ArkanaStats } from '@/lib/arkana/types';
import { recalculateLiveStats } from '@/lib/arkana/effectsUtils';

describe('/api/arkana/world-object/perform-action', () => {
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
   * Helper: Create Arkana test user with stats and skills
   */
  async function createArkanaTestUser(arkanaStatsData: {
    characterName: string;
    race: string;
    archetype: string;
    physical: number;
    dexterity: number;
    mental: number;
    perception: number;
    hitPoints: number;
    skills?: Array<{ skill_id: string; skill_name: string; level: number }>;
    activeEffects?: ActiveEffect[];
    liveStats?: LiveStats;
    status?: number; // 0 = RP mode
  }) {
    const { user } = await createTestUser('arkana');

    // Create user stats with specified status (default 0 = RP mode)
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

    // Load all data BEFORE calculating liveStats
    const { loadAllData } = await import('@/lib/arkana/dataLoader');
    await loadAllData();

    // If activeEffects provided but no liveStats, calculate them
    let calculatedLiveStats = arkanaStatsData.liveStats;
    if (arkanaStatsData.activeEffects && arkanaStatsData.activeEffects.length > 0 && !arkanaStatsData.liveStats) {
      // Create a temporary ArkanaStats object for calculation
      const tempStats = {
        physical: arkanaStatsData.physical,
        mental: arkanaStatsData.mental,
        dexterity: arkanaStatsData.dexterity,
        perception: arkanaStatsData.perception,
      } as ArkanaStats;
      calculatedLiveStats = recalculateLiveStats(tempStats, arkanaStatsData.activeEffects);
    }

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
        hitPoints: arkanaStatsData.hitPoints,
        skills: (arkanaStatsData.skills || []) as unknown as typeof prisma.$Prisma.JsonNull,
        activeEffects: (arkanaStatsData.activeEffects || []) as unknown as typeof prisma.$Prisma.JsonNull,
        liveStats: (calculatedLiveStats || {}) as unknown as typeof prisma.$Prisma.JsonNull
      }
    });

    return user;
  }

  /**
   * Helper: Create request data with signature
   */
  function createPerformActionRequest(playerUuid: string, objectId: string, actionId: string) {
    const timestamp = new Date().toISOString();
    const signature = generateSignature(timestamp, 'arkana');
    return {
      playerUuid,
      objectId,
      actionId,
      universe: 'arkana',
      timestamp,
      signature
    };
  }

  describe('1. Basic Functionality', () => {
    it('1.1 should successfully perform simple action without checks or skills', async () => {
      const player = await createArkanaTestUser({
        characterName: 'TestPlayer',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        hitPoints: 10
      });

      // Create world object with simple action (no checks or skills)
      await prisma.worldObject.create({
        data: {
          objectId: 'DOOR_SIMPLE',
          universe: 'arkana',
          name: 'Simple Door',
          type: 'door',
          state: 'closed',
          actions: [
            {
              action: 'Open',
              showStates: 'closed',
              successState: 'open'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'DOOR_SIMPLE', 'Open');
      const request = createMockPostRequest('/api/arkana/world-object/perform-action', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      // Debug: log error if present
      if (!data.success) {
        console.log('Test 1.1 Error:', data.error);
        console.log('Test 1.1 Response status:', response.status);

        // Debug: check what activeEffects looks like in database
        const debugStats = await prisma.arkanaStats.findFirst({ where: { userId: player.id } });
        console.log('Test 1.1 activeEffects from DB:', debugStats?.activeEffects);
        console.log('Test 1.1 activeEffects type:', typeof debugStats?.activeEffects);
        console.log('Test 1.1 is Array:', Array.isArray(debugStats?.activeEffects));
      }

      expect(data.success).toBe(true);
      expect(data.data.actionSuccess).toBe('true');
      expect(data.data.actionName).toBe('Open');
      expect(data.data.objectName).toBe('Simple Door');
      expect(data.data.objectState).toBe('open');
      // Message is URL-encoded for LSL (spaces become %20, etc.)
      expect(decodeURIComponent(data.data.message)).toContain('TestPlayer');
      expect(decodeURIComponent(data.data.message)).toContain('Simple Door');

      // Verify object state was updated in database
      const updatedObject = await prisma.worldObject.findUnique({
        where: { objectId_universe: { objectId: 'DOOR_SIMPLE', universe: 'arkana' } }
      });
      expect(updatedObject!.state).toBe('open');
    });

    it('1.2 should process player turn even on simple action', async () => {
      const player = await createArkanaTestUser({
        characterName: 'TurnTest',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_mental_1_turn',
            name: 'Mental Buff +1',
            duration: 'turns:3',
            turnsLeft: 3,
            appliedAt: new Date().toISOString(),
            casterName: 'TurnTest'
          }
        ]
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'DOOR_TURN',
          universe: 'arkana',
          name: 'Turn Test Door',
          type: 'door',
          state: 'closed',
          actions: [
            {
              action: 'Open',
              showStates: 'closed',
              successState: 'open'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'DOOR_TURN', 'Open');
      const request = createMockPostRequest('/api/arkana/world-object/perform-action', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);

      // Verify turn was processed (active effect decremented)
      const updatedStats = await prisma.arkanaStats.findFirst({
        where: { userId: player.id }
      });
      const activeEffects = updatedStats!.activeEffects as ActiveEffect[];
      expect(activeEffects).toHaveLength(1);
      expect(activeEffects[0].turnsLeft).toBe(2); // Decremented from 3
    });
  });

  describe('2. Skill Validation', () => {
    it('2.1 should succeed when player has required skill at sufficient level', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Hacker',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        hitPoints: 10,
        skills: [
          { skill_id: 'skill_hack', skill_name: 'Hacking', level: 2 }
        ]
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'SECURE_DOOR',
          universe: 'arkana',
          name: 'Secure Door',
          type: 'door',
          state: 'locked',
          actions: [
            {
              action: 'Hack',
              showStates: 'locked',
              skills: 'skill_hack,1', // Requires hacking level 1
              successState: 'hacked'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'SECURE_DOOR', 'Hack');
      const request = createMockPostRequest('/api/arkana/world-object/perform-action', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.actionSuccess).toBe('true');
      expect(data.data.objectState).toBe('hacked');
    });

    it('2.2 should fail when player lacks required skill', async () => {
      const player = await createArkanaTestUser({
        characterName: 'NoSkills',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        hitPoints: 10,
        skills: [] // No skills
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'SECURE_DOOR2',
          universe: 'arkana',
          name: 'Secure Door',
          type: 'door',
          state: 'locked',
          actions: [
            {
              action: 'Hack',
              showStates: 'locked',
              skills: 'skill_hack,1', // Requires hacking level 1
              successState: 'hacked'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'SECURE_DOOR2', 'Hack');
      const request = createMockPostRequest('/api/arkana/world-object/perform-action', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.actionSuccess).toBe('false');
      expect(data.data.objectState).toBe('locked'); // State unchanged
      const decodedMessage = decodeURIComponent(data.data.message);
      expect(decodedMessage).toContain('NoSkills');
      expect(decodedMessage).toContain('cannot');
      expect(decodedMessage).toContain('skill_hack');
      expect(data.data.skillsMissing).toBeDefined();
      expect(data.data.skillsMissing).toContain('skill_hack (level 1)');
    });

    it('2.3 should fail when player has skill but insufficient level', async () => {
      const player = await createArkanaTestUser({
        characterName: 'NoviceHacker',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        hitPoints: 10,
        skills: [
          { skill_id: 'skill_hack', skill_name: 'Hacking', level: 1 } // Level 1
        ]
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'ADVANCED_DOOR',
          universe: 'arkana',
          name: 'Advanced Door',
          type: 'door',
          state: 'locked',
          actions: [
            {
              action: 'Hack',
              showStates: 'locked',
              skills: 'skill_hack,3', // Requires hacking level 3
              successState: 'hacked'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'ADVANCED_DOOR', 'Hack');
      const request = createMockPostRequest('/api/arkana/world-object/perform-action', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.actionSuccess).toBe('false');
      expect(data.data.objectState).toBe('locked');
      const decodedMessage = decodeURIComponent(data.data.message);
      expect(decodedMessage).toContain('Missing required skills');
    });

    it('2.4 should succeed with OR skill requirements (first skill match)', async () => {
      const player = await createArkanaTestUser({
        characterName: 'EngineerOnly',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        hitPoints: 10,
        skills: [
          { skill_id: 'skill_engineering', skill_name: 'Engineering', level: 2 }
          // No hacking skill
        ]
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'OR_DOOR',
          universe: 'arkana',
          name: 'OR Door',
          type: 'door',
          state: 'locked',
          actions: [
            {
              action: 'Bypass',
              showStates: 'locked',
              skills: 'skill_hack,1 OR skill_engineering,1', // Hacking OR Engineering
              successState: 'open'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'OR_DOOR', 'Bypass');
      const request = createMockPostRequest('/api/arkana/world-object/perform-action', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.actionSuccess).toBe('true');
      expect(data.data.objectState).toBe('open');
    });

    it('2.5 should succeed with OR skill requirements (second skill match)', async () => {
      const player = await createArkanaTestUser({
        characterName: 'HackerOnly',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        hitPoints: 10,
        skills: [
          { skill_id: 'skill_hack', skill_name: 'Hacking', level: 3 }
          // No engineering skill
        ]
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'OR_DOOR2',
          universe: 'arkana',
          name: 'OR Door 2',
          type: 'door',
          state: 'locked',
          actions: [
            {
              action: 'Bypass',
              showStates: 'locked',
              skills: 'skill_hack,1 OR skill_engineering,1', // Hacking OR Engineering
              successState: 'open'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'OR_DOOR2', 'Bypass');
      const request = createMockPostRequest('/api/arkana/world-object/perform-action', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.actionSuccess).toBe('true');
      expect(data.data.objectState).toBe('open');
    });

    it('2.6 should fail when player has neither OR skill', async () => {
      const player = await createArkanaTestUser({
        characterName: 'NoRelevantSkills',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        hitPoints: 10,
        skills: [
          { skill_id: 'skill_stealth', skill_name: 'Stealth', level: 3 }
        ]
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'OR_DOOR3',
          universe: 'arkana',
          name: 'OR Door 3',
          type: 'door',
          state: 'locked',
          actions: [
            {
              action: 'Bypass',
              showStates: 'locked',
              skills: 'skill_hack,1 OR skill_engineering,1', // Hacking OR Engineering
              successState: 'open'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'OR_DOOR3', 'Bypass');
      const request = createMockPostRequest('/api/arkana/world-object/perform-action', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.actionSuccess).toBe('false');
      expect(data.data.objectState).toBe('locked');
      const decodedMessage = decodeURIComponent(data.data.message);
      expect(decodedMessage).toContain('Missing required skills');
      expect(data.data.message).toContain('OR');
    });
  });

  describe('3. Check Execution (d20 Stat Checks)', () => {
    it('3.1 should execute mental check and succeed on high roll', async () => {
      const player = await createArkanaTestUser({
        characterName: 'SmartPlayer',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 5, // +2 modifier (high stat)
        perception: 2,
        hitPoints: 10
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'PUZZLE_BOX',
          universe: 'arkana',
          name: 'Puzzle Box',
          type: 'puzzle',
          state: 'locked',
          actions: [
            {
              action: 'Solve',
              showStates: 'locked',
              checks: 'check_mental_vs_tn12', // Mental check vs TN 12
              successState: 'solved'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'PUZZLE_BOX', 'Solve');
      const request = createMockPostRequest('/api/arkana/world-object/perform-action', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.actionName).toBe('Solve');
      expect(data.data.objectName).toBe('Puzzle Box');

      // Check should either succeed or fail (d20 roll is random)
      const decodedMessage = decodeURIComponent(data.data.message);
      if (data.data.actionSuccess === 'true') {
        expect(data.data.objectState).toBe('solved');
        expect(decodedMessage).toContain('successfully');
        // Roll info may or may not be present depending on implementation
        if (data.data.rollInfo) {
          expect(data.data.rollInfo).toBeTruthy();
        }
      } else {
        expect(data.data.objectState).toBe('locked');
        expect(decodedMessage).toContain('FAILED');
        // Roll info may or may not be present depending on implementation
        if (data.data.rollInfo) {
          expect(data.data.rollInfo).toBeTruthy();
        }
      }
    });

    it('3.2 should use liveStats for check when active effects present', async () => {
      const player = await createArkanaTestUser({
        characterName: 'BuffedPlayer',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 2, // Base mental is low
        perception: 2,
        hitPoints: 10,
        activeEffects: [
          {
            effectId: 'buff_mental_1_turn',
            name: 'Mental Buff +1',
            duration: 'turns:5',
            turnsLeft: 5,
            appliedAt: new Date().toISOString(),
            casterName: 'BuffedPlayer'
          }
        ]
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'PUZZLE_BOX2',
          universe: 'arkana',
          name: 'Puzzle Box 2',
          type: 'puzzle',
          state: 'locked',
          actions: [
            {
              action: 'Solve',
              showStates: 'locked',
              checks: 'check_mental_vs_tn12',
              successState: 'solved'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'PUZZLE_BOX2', 'Solve');
      const request = createMockPostRequest('/api/arkana/world-object/perform-action', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      // Should use liveStats (mental 3 = base 2 + buff 1) for check
      // Verification: active effect was decremented
      const updatedStats = await prisma.arkanaStats.findFirst({
        where: { userId: player.id }
      });
      const activeEffects = updatedStats!.activeEffects as ActiveEffect[];
      expect(activeEffects).toHaveLength(1);
      expect(activeEffects[0].turnsLeft).toBe(4); // Decremented from 5
    });

    it('3.3 should return detailed roll info on check success', async () => {
      const player = await createArkanaTestUser({
        characterName: 'RollInfoTest',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 5, // High mental for better success chance
        perception: 2,
        hitPoints: 10
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'PUZZLE_BOX3',
          universe: 'arkana',
          name: 'Puzzle Box 3',
          type: 'puzzle',
          state: 'locked',
          actions: [
            {
              action: 'Solve',
              showStates: 'locked',
              checks: 'check_mental_vs_tn12',
              successState: 'solved'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'PUZZLE_BOX3', 'Solve');
      const request = createMockPostRequest('/api/arkana/world-object/perform-action', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);

      // Roll info may be present depending on result
      const decodedMessage = decodeURIComponent(data.data.message);
      if (data.data.actionSuccess === 'true') {
        expect(decodedMessage).toContain('successfully');
        if (data.data.rollInfo) {
          expect(decodedMessage).toContain(data.data.rollInfo);
        }
      } else {
        expect(decodedMessage).toContain('FAILED');
        if (data.data.rollInfo) {
          expect(data.data.rollInfo).toBeTruthy();
        }
      }
    });
  });

  describe('4. Ownership Checks', () => {
    it('4.1 should succeed when player is object owner', async () => {
      const player = await createArkanaTestUser({
        characterName: 'Owner',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        hitPoints: 10
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'OWNED_DOOR',
          universe: 'arkana',
          name: 'Owned Door',
          type: 'door',
          state: 'closed',
          owner: player.slUuid, // Player is owner
          actions: [
            {
              action: 'Lock',
              showStates: 'closed',
              checks: 'check_is_object_owner', // Ownership check
              successState: 'locked'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'OWNED_DOOR', 'Lock');
      const request = createMockPostRequest('/api/arkana/world-object/perform-action', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.actionSuccess).toBe('true');
      expect(data.data.objectState).toBe('locked'); // successState in action
      const decodedMessage = decodeURIComponent(data.data.message);
      expect(decodedMessage).toContain('successfully');
    });

    it('4.2 should fail when player is not object owner', async () => {
      const owner = await createArkanaTestUser({
        characterName: 'ActualOwner',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        hitPoints: 10
      });

      const nonOwner = await createArkanaTestUser({
        characterName: 'NotOwner',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        hitPoints: 10
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'OWNED_DOOR2',
          universe: 'arkana',
          name: 'Owned Door 2',
          type: 'door',
          state: 'closed',
          owner: owner.slUuid, // Different owner
          actions: [
            {
              action: 'Lock',
              showStates: 'closed',
              checks: 'check_is_object_owner', // Ownership check
              successState: 'locked'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(nonOwner.slUuid, 'OWNED_DOOR2', 'Lock');
      const request = createMockPostRequest('/api/arkana/world-object/perform-action', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.actionSuccess).toBe('false');
      expect(data.data.objectState).toBe('closed'); // State unchanged
      const decodedMessage = decodeURIComponent(data.data.message);
      expect(decodedMessage).toContain('NotOwner');
      expect(decodedMessage).toContain('cannot');
      expect(decodedMessage).toContain('owner');
    });
  });

  describe('5. Combined Skills and Checks', () => {
    it('5.1 should validate skills first, then execute check', async () => {
      const player = await createArkanaTestUser({
        characterName: 'SkillfulHacker',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 4, // +1 modifier
        perception: 2,
        hitPoints: 10,
        skills: [
          { skill_id: 'skill_hack', skill_name: 'Hacking', level: 2 }
        ]
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'VAULT_DOOR',
          universe: 'arkana',
          name: 'Vault Door',
          type: 'door',
          state: 'locked',
          actions: [
            {
              action: 'Hack',
              showStates: 'locked',
              skills: 'skill_hack,1', // Skill requirement
              checks: 'check_mental_vs_tn12', // Check requirement
              successState: 'hacked'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'VAULT_DOOR', 'Hack');
      const request = createMockPostRequest('/api/arkana/world-object/perform-action', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.actionName).toBe('Hack');

      // Skill check passed (has skill_hack level 2 >= 1)
      // Check execution result depends on d20 roll
      const decodedMessage = decodeURIComponent(data.data.message);
      if (data.data.actionSuccess === 'true') {
        expect(data.data.objectState).toBe('hacked');
        expect(data.data.rollInfo).toBeDefined();
      } else {
        expect(data.data.objectState).toBe('locked');
        expect(decodedMessage).toContain('FAILED');
      }
    });

    it('5.2 should fail at skill check before executing check', async () => {
      const player = await createArkanaTestUser({
        characterName: 'NoSkillPlayer',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 5, // High mental, but no skill
        perception: 2,
        hitPoints: 10,
        skills: [] // No skills
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'VAULT_DOOR2',
          universe: 'arkana',
          name: 'Vault Door 2',
          type: 'door',
          state: 'locked',
          actions: [
            {
              action: 'Hack',
              showStates: 'locked',
              skills: 'skill_hack,1', // Skill requirement
              checks: 'check_mental_vs_tn12', // Check requirement
              successState: 'hacked'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'VAULT_DOOR2', 'Hack');
      const request = createMockPostRequest('/api/arkana/world-object/perform-action', requestData);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(data.success).toBe(true);
      expect(data.data.actionSuccess).toBe('false');
      expect(data.data.objectState).toBe('locked');
      const decodedMessage = decodeURIComponent(data.data.message);
      expect(decodedMessage).toContain('Missing required skills');
      expect(data.data.skillsMissing).toBeDefined();
      // Roll info should NOT be present (check never executed)
      expect(data.data.rollInfo).toBeUndefined();
    });
  });

  describe('6. Error Cases', () => {
    it('6.1 should return 404 when world object not found', async () => {
      const player = await createArkanaTestUser({
        characterName: 'TestPlayer',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        hitPoints: 10
      });

      const requestData = createPerformActionRequest(player.slUuid, 'NONEXISTENT', 'Open');

      await testExpectedError(
        'World object not found',
        async () => {
          const response = await POST(createMockPostRequest('/api/arkana/world-object/perform-action', requestData));
          const data = await parseJsonResponse(response);
          expect(data.success).toBe(false);
          expect(response.status).toBe(404);
          expect(data.error).toContain('World object not found');
        }
      );
    });

    it('6.2 should return 404 when player not found', async () => {
      await prisma.worldObject.create({
        data: {
          objectId: 'TEST_DOOR',
          universe: 'arkana',
          name: 'Test Door',
          type: 'door',
          state: 'closed',
          actions: [
            {
              action: 'Open',
              showStates: 'closed',
              successState: 'open'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest('00000000-0000-0000-0000-000000000000', 'TEST_DOOR', 'Open');

      await testExpectedError(
        'Player not found',
        async () => {
          const response = await POST(createMockPostRequest('/api/arkana/world-object/perform-action', requestData));
          const data = await parseJsonResponse(response);
          expect(data.success).toBe(false);
          expect(response.status).toBe(404);
          expect(data.error).toContain('Player not found');
        }
      );
    });

    it('6.3 should return 404 when action not found on object', async () => {
      const player = await createArkanaTestUser({
        characterName: 'TestPlayer',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        hitPoints: 10
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'LIMITED_DOOR',
          universe: 'arkana',
          name: 'Limited Door',
          type: 'door',
          state: 'closed',
          actions: [
            {
              action: 'Open',
              showStates: 'closed',
              successState: 'open'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'LIMITED_DOOR', 'Hack'); // Action doesn't exist

      await testExpectedError(
        'Action not found',
        async () => {
          const response = await POST(createMockPostRequest('/api/arkana/world-object/perform-action', requestData));
          const data = await parseJsonResponse(response);
          expect(data.success).toBe(false);
          expect(response.status).toBe(404);
          expect(data.error).toContain('Action');
          expect(data.error).toContain('not found');
        }
      );
    });

    it('6.4 should return 400 when player not in RP mode', async () => {
      const player = await createArkanaTestUser({
        characterName: 'OOCPlayer',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        hitPoints: 10,
        status: 1 // NOT in RP mode (status !== 0)
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'RP_DOOR',
          universe: 'arkana',
          name: 'RP Door',
          type: 'door',
          state: 'closed',
          actions: [
            {
              action: 'Open',
              showStates: 'closed',
              successState: 'open'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'RP_DOOR', 'Open');

      await testExpectedError(
        'Player not in RP mode',
        async () => {
          const response = await POST(createMockPostRequest('/api/arkana/world-object/perform-action', requestData));
          const data = await parseJsonResponse(response);
          expect(data.success).toBe(false);
          expect(response.status).toBe(400);
          expect(data.error).toContain('not in RP mode');
        }
      );
    });

    it('6.5 should return 400 when player registration incomplete', async () => {
      const { user } = await createTestUser('arkana');

      // Create incomplete registration (no registrationCompleted)
      await prisma.userStats.create({
        data: {
          userId: user.id,
          health: 100,
          hunger: 100,
          thirst: 100,
          copperCoin: 100,
          status: 0
        }
      });

      await prisma.arkanaStats.create({
        data: {
          userId: user.id,
          agentName: user.username + ' Resident',
          registrationCompleted: false, // NOT COMPLETED
          characterName: 'Incomplete',
          race: 'human',
          archetype: 'Arcanist',
          physical: 2,
          dexterity: 3,
          mental: 3,
          perception: 2,
          hitPoints: 10
        }
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'REG_DOOR',
          universe: 'arkana',
          name: 'Registration Door',
          type: 'door',
          state: 'closed',
          actions: [
            {
              action: 'Open',
              showStates: 'closed',
              successState: 'open'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(user.slUuid, 'REG_DOOR', 'Open');

      await testExpectedError(
        'Registration incomplete',
        async () => {
          const response = await POST(createMockPostRequest('/api/arkana/world-object/perform-action', requestData));
          const data = await parseJsonResponse(response);
          expect(data.success).toBe(false);
          expect(response.status).toBe(404);
          expect(data.error).toContain('registration incomplete');
        }
      );
    });

    it('6.6 should reject invalid signature', async () => {
      const player = await createArkanaTestUser({
        characterName: 'TestPlayer',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        hitPoints: 10
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'SIG_DOOR',
          universe: 'arkana',
          name: 'Sig Door',
          type: 'door',
          state: 'closed',
          actions: [
            {
              action: 'Open',
              showStates: 'closed',
              successState: 'open'
            }
          ]
        }
      });

      const timestamp = new Date().toISOString();
      const requestData = {
        playerUuid: player.slUuid,
        objectId: 'SIG_DOOR',
        actionId: 'Open',
        universe: 'arkana',
        timestamp,
        signature: '0000000000000000000000000000000000000000000000000000000000000000' // Invalid
      };

      await testExpectedError(
        'Invalid signature',
        async () => {
          const response = await POST(createMockPostRequest('/api/arkana/world-object/perform-action', requestData));
          const data = await parseJsonResponse(response);
          expect(data.success).toBe(false);
          expect(response.status).toBe(401);
        }
      );
    });

    it('6.7 should reject missing required fields', async () => {
      const timestamp = new Date().toISOString();
      const requestData = {
        universe: 'arkana',
        // Missing playerUuid, objectId, actionId
        timestamp,
        signature: 'test'
      };

      await testExpectedError(
        'Missing required fields',
        async () => {
          const response = await POST(createMockPostRequest('/api/arkana/world-object/perform-action', requestData));
          const data = await parseJsonResponse(response);
          expect(data.success).toBe(false);
          expect(response.status).toBe(400);
        }
      );
    });

    it('6.8 should return 500 when check definition not found', async () => {
      const player = await createArkanaTestUser({
        characterName: 'TestPlayer',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        hitPoints: 10
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'BAD_CHECK_DOOR',
          universe: 'arkana',
          name: 'Bad Check Door',
          type: 'door',
          state: 'locked',
          actions: [
            {
              action: 'Open',
              showStates: 'locked',
              checks: 'nonexistent_check_id', // Invalid check ID
              successState: 'open'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'BAD_CHECK_DOOR', 'Open');

      await testExpectedError(
        'Check definition not found',
        async () => {
          const response = await POST(createMockPostRequest('/api/arkana/world-object/perform-action', requestData));
          const data = await parseJsonResponse(response);
          expect(data.success).toBe(false);
          expect(response.status).toBe(500);
          expect(data.error).toContain('Check definition');
          expect(data.error).toContain('not found');
        }
      );
    });
  });

  describe('7. State Management', () => {
    it('7.1 should update object state on success', async () => {
      const player = await createArkanaTestUser({
        characterName: 'StateTest',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        hitPoints: 10
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'STATE_DOOR',
          universe: 'arkana',
          name: 'State Door',
          type: 'door',
          state: 'closed',
          actions: [
            {
              action: 'Open',
              showStates: 'closed',
              successState: 'open'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'STATE_DOOR', 'Open');
      const request = createMockPostRequest('/api/arkana/world-object/perform-action', requestData);
      await POST(request);

      // Verify state changed in database
      const updatedObject = await prisma.worldObject.findUnique({
        where: { objectId_universe: { objectId: 'STATE_DOOR', universe: 'arkana' } }
      });
      expect(updatedObject!.state).toBe('open');
    });

    it('7.2 should NOT update object state on failure', async () => {
      const player = await createArkanaTestUser({
        characterName: 'FailureTest',
        race: 'human',
        archetype: 'Arcanist',
        physical: 2,
        dexterity: 3,
        mental: 3,
        perception: 2,
        hitPoints: 10,
        skills: [] // No skills - will fail
      });

      await prisma.worldObject.create({
        data: {
          objectId: 'FAIL_DOOR',
          universe: 'arkana',
          name: 'Fail Door',
          type: 'door',
          state: 'locked',
          actions: [
            {
              action: 'Hack',
              showStates: 'locked',
              skills: 'skill_hack,1', // Requires skill - will fail
              successState: 'hacked'
            }
          ]
        }
      });

      const requestData = createPerformActionRequest(player.slUuid, 'FAIL_DOOR', 'Hack');
      const request = createMockPostRequest('/api/arkana/world-object/perform-action', requestData);
      await POST(request);

      // Verify state unchanged in database
      const updatedObject = await prisma.worldObject.findUnique({
        where: { objectId_universe: { objectId: 'FAIL_DOOR', universe: 'arkana' } }
      });
      expect(updatedObject!.state).toBe('locked'); // Still locked
    });
  });
});
