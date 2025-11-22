import { POST } from '../route';
import { prisma } from '@/lib/prisma';
import { generateSignature } from '@/lib/signature';
import {
  createMockPostRequest,
  parseJsonResponse,
  expectSuccess,
  expectError,
  cleanupTestData
} from '@/__tests__/utils/test-helpers';
import type { ActiveEffect } from '@/lib/gor/types';

// Helper to create test body with signature
function createRequestBody(data: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const universe = 'gor';
  return {
    ...data,
    universe,
    timestamp,
    signature: generateSignature(timestamp, universe)
  };
}

// Helper to create a test Gorean character with abilities
async function createTestCharacter(overrides: Record<string, unknown> = {}) {
  const uuid = crypto.randomUUID();
  const username = `TestChar${Date.now()}${Math.random().toString(36).slice(2, 7)}`;

  const user = await prisma.user.create({
    data: {
      slUuid: uuid,
      universe: 'gor',
      username,
      role: 'FREE',
      stats: {
        create: {
          health: (overrides.healthCurrent ?? 80) as number,
          status: (overrides.status ?? 2) as number, // Combat Mode
          hunger: 100,
          thirst: 100
        }
      },
      goreanStats: {
        create: {
          characterName: overrides.characterName as string || 'Test Character',
          agentName: username,
          species: 'human',
          speciesCategory: 'sapient',
          culture: 'southern_cities',
          cultureType: 'cityState',
          socialStatus: 'freeMan',
          strength: overrides.strength as number || 3,
          agility: overrides.agility as number || 3,
          intellect: overrides.intellect as number || 2,
          perception: overrides.perception as number || 2,
          charisma: overrides.charisma as number || 3,
          statPointsPool: 0,
          statPointsSpent: 10,
          healthMax: (overrides.healthMax ?? 88) as number,
          healthCurrent: (overrides.healthCurrent ?? 80) as number,
          hungerMax: 100,
          hungerCurrent: 100,
          thirstMax: 100,
          thirstCurrent: 100,
          skills: [],
          abilities: overrides.abilities || [
            { ability_id: 'combat_expertise', ability_name: 'Combat Expertise' },
            { ability_id: 'second_wind', ability_name: 'Second Wind' },
            { ability_id: 'battle_cry', ability_name: 'Battle Cry' },
            { ability_id: 'capture_throw', ability_name: 'Capture Throw' }
          ],
          activeEffects: overrides.activeEffects || [],
          liveStats: overrides.liveStats || {},
          xp: 0,
          registrationCompleted: true
        }
      }
    }
  });

  return { uuid, username, user };
}

describe('POST /api/gor/combat/use-ability', () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Validation', () => {
    it('should reject request without caster_uuid', async () => {
      const body = createRequestBody({
        ability_id: 'combat_expertise'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'caster_uuid');
    });

    it('should reject request without ability_id or ability_name', async () => {
      const body = createRequestBody({
        caster_uuid: crypto.randomUUID()
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'ability_id');
    });

    it('should reject invalid signature', async () => {
      const body = {
        caster_uuid: crypto.randomUUID(),
        ability_id: 'combat_expertise',
        universe: 'gor',
        timestamp: new Date().toISOString(),
        signature: 'invalid_signature'
      };

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'signature');
    });
  });

  describe('User/Ability Not Found', () => {
    it('should return 404 for non-existent caster', async () => {
      const body = createRequestBody({
        caster_uuid: crypto.randomUUID(),
        ability_id: 'combat_expertise'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Caster not found');
    });

    it('should return 404 for non-existent ability', async () => {
      const { uuid } = await createTestCharacter();

      const body = createRequestBody({
        caster_uuid: uuid,
        ability_id: 'nonexistent_ability'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Ability not found');
    });

    it('should reject if caster does not have the ability', async () => {
      const { uuid } = await createTestCharacter({
        abilities: [] // No abilities
      });

      const body = createRequestBody({
        caster_uuid: uuid,
        ability_id: 'combat_expertise'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'do not have this ability');
    });
  });

  describe('Combat Mode Restrictions', () => {
    it('should reject if caster is in OOC mode', async () => {
      const { uuid } = await createTestCharacter({
        status: 4 // OOC Mode
      });

      const body = createRequestBody({
        caster_uuid: uuid,
        ability_id: 'combat_expertise'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Full, Survival, Combat or RP mode');
    });

    it('should allow ability use in Combat mode', async () => {
      const { uuid } = await createTestCharacter({
        status: 2 // Combat Mode
      });

      const body = createRequestBody({
        caster_uuid: uuid,
        ability_id: 'combat_expertise'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
    });
  });

  describe('Control Effects Blocking', () => {
    it('should reject if caster is stunned', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: [
          {
            effectId: 'control_stun_1',
            name: 'Stunned',
            category: 'control',
            controlType: 'stun',
            turnsRemaining: 1
          }
        ],
        liveStats: { stun: 'Stunned' }
      });

      const body = createRequestBody({
        caster_uuid: uuid,
        ability_id: 'combat_expertise'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'stunned');
    });

    it('should reject if caster is asleep', async () => {
      const { uuid } = await createTestCharacter({
        activeEffects: [
          {
            effectId: 'control_sleep',
            name: 'Asleep',
            category: 'control',
            controlType: 'sleep',
            turnsRemaining: 1
          }
        ],
        liveStats: { sleep: 'Asleep' }
      });

      const body = createRequestBody({
        caster_uuid: uuid,
        ability_id: 'combat_expertise'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'asleep');
    });
  });

  describe('Unconscious Check', () => {
    it('should reject if caster is unconscious', async () => {
      const { uuid } = await createTestCharacter({
        healthCurrent: 0
      });

      const body = createRequestBody({
        caster_uuid: uuid,
        ability_id: 'combat_expertise'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'unconscious');
    });

    it('should reject if target is unconscious', async () => {
      const { uuid: casterUuid } = await createTestCharacter();
      const { uuid: targetUuid } = await createTestCharacter({
        healthCurrent: 0
      });

      const body = createRequestBody({
        caster_uuid: casterUuid,
        target_uuid: targetUuid,
        ability_id: 'battle_cry'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'unconscious');
    });
  });

  describe('Successful Ability Use', () => {
    it('should successfully use Combat Expertise (self buff)', async () => {
      const { uuid } = await createTestCharacter({
        characterName: 'Tarl Cabot'
      });

      const body = createRequestBody({
        caster_uuid: uuid,
        ability_id: 'combat_expertise'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.abilityUsed).toBe('Combat Expertise');
      expect(data.data).toHaveProperty('affected');
      expect(data.data).toHaveProperty('caster');
      expect(data.data).toHaveProperty('message');
      expect(data.data).toHaveProperty('activationSuccess');

      // Combat Expertise has a d20 vs TN10 check (probabilistic)
      // Either the check passed and effects applied, or check failed
      if (data.data.activationSuccess) {
        // Check passed - caster should be in affected with effects
        const selfAffected = data.data.affected.find(
          (a: { uuid: string }) => a.uuid === uuid
        );
        expect(selfAffected).toBeDefined();
        expect(selfAffected.effects.length).toBeGreaterThan(0);
      } else {
        // Check failed - caster not in affected (no effects applied)
        expect(data.data.affected.length).toBe(0);
        expect(data.data.rollInfo).toBeDefined();
      }
    });

    it('should successfully use Battle Cry against target', async () => {
      const { uuid: casterUuid } = await createTestCharacter({
        characterName: 'Tarl',
        charisma: 4
      });
      const { uuid: targetUuid } = await createTestCharacter({
        characterName: 'Marcus',
        charisma: 2
      });

      const body = createRequestBody({
        caster_uuid: casterUuid,
        target_uuid: targetUuid,
        ability_id: 'battle_cry'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.abilityUsed).toBe('Battle Cry');

      // Result depends on contested check
      if (data.data.activationSuccess) {
        // Check that target was affected with debuffs
        const targetAffected = data.data.affected.find(
          (a: { uuid: string }) => a.uuid === targetUuid
        );
        expect(targetAffected).toBeDefined();
        expect(targetAffected.effects.length).toBeGreaterThan(0);
      }
    });

    it('should apply healing with Second Wind', async () => {
      const { uuid } = await createTestCharacter({
        healthCurrent: 50,
        healthMax: 100
      });

      const body = createRequestBody({
        caster_uuid: uuid,
        ability_id: 'second_wind'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.abilityUsed).toBe('Second Wind');

      // If check succeeds, should heal 10% of max HP = 10
      if (data.data.activationSuccess) {
        const selfAffected = data.data.affected.find(
          (a: { uuid: string }) => a.uuid === uuid
        );
        expect(selfAffected).toBeDefined();
        // Should have healing effect
        expect(selfAffected.effects.some((e: string) => e.includes('HP'))).toBe(true);
      }
    });

    it('should apply control effect with Capture Throw', async () => {
      const { uuid: casterUuid } = await createTestCharacter({
        strength: 5
      });
      const { uuid: targetUuid } = await createTestCharacter({
        agility: 1 // Low agility for easier check
      });

      const body = createRequestBody({
        caster_uuid: casterUuid,
        target_uuid: targetUuid,
        ability_id: 'capture_throw'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      if (data.data.activationSuccess) {
        // Target should be affected with stun and damage
        const targetAffected = data.data.affected.find(
          (a: { uuid: string }) => a.uuid === targetUuid
        );
        expect(targetAffected).toBeDefined();
      }
    });
  });

  describe('Check Mechanics', () => {
    it('should include roll info on check success', async () => {
      const { uuid } = await createTestCharacter();

      const body = createRequestBody({
        caster_uuid: uuid,
        ability_id: 'combat_expertise'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.rollInfo).toBeTruthy();
      // Should contain roll information
      expect(data.data.rollInfo).toContain('TN');
    });

    it('should fail ability when check fails', async () => {
      // This is probabilistic, but with low stats the check is more likely to fail
      const { uuid: casterUuid } = await createTestCharacter({
        charisma: 1 // Very low charisma
      });
      const { uuid: targetUuid } = await createTestCharacter({
        charisma: 5 // Very high charisma
      });

      const body = createRequestBody({
        caster_uuid: casterUuid,
        target_uuid: targetUuid,
        ability_id: 'battle_cry'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      // Message should indicate outcome
      const message = decodeURIComponent(data.data.message);
      expect(message).toMatch(/(Success|Failed)/);
    });
  });

  describe('Cooldown Enforcement', () => {
    it('should enforce cooldown on Second Wind', async () => {
      const { uuid, user } = await createTestCharacter();

      // Create a recent ability use event
      await prisma.event.create({
        data: {
          userId: user.id,
          type: 'ABILITY_USE',
          details: {
            abilityId: 'second_wind',
            success: true
          }
        }
      });

      const body = createRequestBody({
        caster_uuid: uuid,
        ability_id: 'second_wind'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'cooldown');
    });

    it('should allow ability use after cooldown expires', async () => {
      const { uuid, user } = await createTestCharacter();

      // Create an old ability use event (31 minutes ago)
      const oldTime = new Date(Date.now() - 31 * 60 * 1000);
      await prisma.event.create({
        data: {
          userId: user.id,
          type: 'ABILITY_USE',
          details: {
            abilityId: 'second_wind',
            success: true
          },
          timestamp: oldTime
        }
      });

      const body = createRequestBody({
        caster_uuid: uuid,
        ability_id: 'second_wind'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
    });
  });

  describe('Event Logging', () => {
    it('should create event log for ability use', async () => {
      const { uuid, user } = await createTestCharacter();

      const body = createRequestBody({
        caster_uuid: uuid,
        ability_id: 'combat_expertise'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      await POST(request);

      // Check that event was created
      const event = await prisma.event.findFirst({
        where: {
          userId: user.id,
          type: 'ABILITY_USE'
        },
        orderBy: {
          timestamp: 'desc'
        }
      });

      expect(event).toBeTruthy();
      expect(event?.details).toHaveProperty('abilityId', 'combat_expertise');
      expect(event?.details).toHaveProperty('abilityName', 'Combat Expertise');
    });
  });

  describe('Database Updates', () => {
    it('should update caster health after healing ability', async () => {
      const { uuid } = await createTestCharacter({
        healthCurrent: 50,
        healthMax: 100
      });

      const body = createRequestBody({
        caster_uuid: uuid,
        ability_id: 'second_wind'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      if (data.data.activationSuccess) {
        // Check database was updated
        const updatedUser = await prisma.user.findFirst({
          where: { slUuid: uuid },
          include: { goreanStats: true }
        });

        // Health should have increased (10% of 100 = 10)
        expect(updatedUser?.goreanStats?.healthCurrent).toBeGreaterThan(50);
      }
    });

    it('should update target active effects after debuff', async () => {
      const { uuid: casterUuid } = await createTestCharacter({
        charisma: 5
      });
      const { uuid: targetUuid } = await createTestCharacter({
        charisma: 1
      });

      const body = createRequestBody({
        caster_uuid: casterUuid,
        target_uuid: targetUuid,
        ability_id: 'battle_cry'
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      if (data.data.activationSuccess) {
        // Check target's active effects were updated
        const updatedTarget = await prisma.user.findFirst({
          where: { slUuid: targetUuid },
          include: { goreanStats: true }
        });

        const activeEffects = updatedTarget?.goreanStats?.activeEffects as unknown[];
        expect(Array.isArray(activeEffects)).toBe(true);
        expect(activeEffects.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Social Group Filtering', () => {
    // Helper to create character with groups
    async function createCharacterWithGroups(
      groups: Record<string, number[]>,
      overrides: Record<string, unknown> = {}
    ) {
      const uuid = crypto.randomUUID();
      const username = `TestChar${Date.now()}${Math.random().toString(36).slice(2, 7)}`;

      const user = await prisma.user.create({
        data: {
          slUuid: uuid,
          universe: 'gor',
          username,
          role: 'FREE',
          groups: groups, // Groups are on the user model
          stats: {
            create: {
              health: (overrides.healthCurrent ?? 80) as number,
              status: (overrides.status ?? 2) as number,
              hunger: 100,
              thirst: 100
            }
          },
          goreanStats: {
            create: {
              characterName: overrides.characterName as string || 'Test Character',
              agentName: username,
              species: 'human',
              speciesCategory: 'sapient',
              culture: 'southern_cities',
              cultureType: 'cityState',
              socialStatus: 'freeMan',
              strength: overrides.strength as number || 3,
              agility: overrides.agility as number || 3,
              intellect: overrides.intellect as number || 2,
              perception: overrides.perception as number || 2,
              charisma: overrides.charisma as number || 3,
              statPointsPool: 0,
              statPointsSpent: 10,
              healthMax: (overrides.healthMax ?? 88) as number,
              healthCurrent: (overrides.healthCurrent ?? 80) as number,
              hungerMax: 100,
              hungerCurrent: 100,
              thirstMax: 100,
              thirstCurrent: 100,
              skills: [],
              abilities: overrides.abilities || [
                { ability_id: 'group_heal', ability_name: 'Group Heal' },
                { ability_id: 'war_cry', ability_name: 'War Cry' },
                { ability_id: 'rally_allies', ability_name: 'Rally Allies' },
                { ability_id: 'intimidate_enemies', ability_name: 'Intimidate Enemies' }
              ],
              activeEffects: overrides.activeEffects || [],
              liveStats: overrides.liveStats || {},
              xp: 0,
              registrationCompleted: true
            }
          }
        },
        include: {
          goreanStats: true
        }
      });

      return { uuid, username, user, goreanId: user.goreanStats!.id };
    }

    it('should only affect allies when target is all_allies', async () => {
      // Create ally and enemy characters first to get their goreanIds
      const { uuid: allyUuid, goreanId: allyGoreanId } = await createCharacterWithGroups({}, {
        characterName: 'Ally Character'
      });
      const { uuid: enemyUuid, goreanId: enemyGoreanId } = await createCharacterWithGroups({}, {
        characterName: 'Enemy Character'
      });
      const { uuid: neutralUuid } = await createCharacterWithGroups({}, {
        characterName: 'Neutral Character'
      });

      // Create caster with ally and enemy in groups
      const { uuid: casterUuid } = await createCharacterWithGroups({
        Allies: [allyGoreanId],
        Enemies: [enemyGoreanId]
      }, {
        characterName: 'Caster',
        abilities: [{ ability_id: 'rally_allies', ability_name: 'Rally Allies' }]
      });

      const body = createRequestBody({
        caster_uuid: casterUuid,
        ability_id: 'rally_allies',
        nearby_uuids: [allyUuid, enemyUuid, neutralUuid]
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Check affected array only contains ally (if activation succeeded)
      if (data.data.activationSuccess) {
        const affectedUuids = data.data.affected.map((a: { uuid: string }) => a.uuid);
        expect(affectedUuids).toContain(allyUuid);
        expect(affectedUuids).not.toContain(enemyUuid);
        expect(affectedUuids).not.toContain(neutralUuid);
      } else {
        expect(data.data.affected.length).toBe(0);
      }
    });

    it('should only affect enemies when target is all_enemies', async () => {
      // Create ally and enemy characters first
      const { uuid: allyUuid, goreanId: allyGoreanId } = await createCharacterWithGroups({}, {
        characterName: 'Ally Character'
      });
      const { uuid: enemyUuid, goreanId: enemyGoreanId } = await createCharacterWithGroups({}, {
        characterName: 'Enemy Character'
      });
      const { uuid: neutralUuid } = await createCharacterWithGroups({}, {
        characterName: 'Neutral Character'
      });

      // Create caster with groups
      const { uuid: casterUuid } = await createCharacterWithGroups({
        Allies: [allyGoreanId],
        Enemies: [enemyGoreanId]
      }, {
        characterName: 'Caster',
        abilities: [{ ability_id: 'intimidate_enemies', ability_name: 'Intimidate Enemies' }]
      });

      const body = createRequestBody({
        caster_uuid: casterUuid,
        ability_id: 'intimidate_enemies',
        nearby_uuids: [allyUuid, enemyUuid, neutralUuid]
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Check affected array only contains enemy (if activation succeeded)
      if (data.data.activationSuccess) {
        const affectedUuids = data.data.affected.map((a: { uuid: string }) => a.uuid);
        expect(affectedUuids).toContain(enemyUuid);
        expect(affectedUuids).not.toContain(allyUuid);
        expect(affectedUuids).not.toContain(neutralUuid);
      } else {
        expect(data.data.affected.length).toBe(0);
      }
    });

    it('should affect allies and self when target is all_allies_and_self', async () => {
      // Create ally and enemy characters
      const { uuid: allyUuid, goreanId: allyGoreanId } = await createCharacterWithGroups({}, {
        characterName: 'Ally Character',
        healthCurrent: 50
      });
      const { uuid: enemyUuid, goreanId: enemyGoreanId } = await createCharacterWithGroups({}, {
        characterName: 'Enemy Character'
      });

      // Create caster with groups
      const { uuid: casterUuid } = await createCharacterWithGroups({
        Allies: [allyGoreanId],
        Enemies: [enemyGoreanId]
      }, {
        characterName: 'Caster',
        healthCurrent: 50,
        abilities: [{ ability_id: 'group_heal', ability_name: 'Group Heal' }]
      });

      const body = createRequestBody({
        caster_uuid: casterUuid,
        ability_id: 'group_heal',
        nearby_uuids: [allyUuid, enemyUuid]
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Check affected includes caster and ally, but not enemy (if activation succeeded)
      if (data.data.activationSuccess) {
        const affectedUuids = data.data.affected.map((a: { uuid: string }) => a.uuid);
        expect(affectedUuids).toContain(casterUuid);
        expect(affectedUuids).toContain(allyUuid);
        expect(affectedUuids).not.toContain(enemyUuid);
      } else {
        expect(data.data.affected.length).toBe(0);
      }
    });

    it('should affect enemies and self when target is all_enemies_and_self', async () => {
      // Create ally and enemy characters
      const { uuid: allyUuid, goreanId: allyGoreanId } = await createCharacterWithGroups({}, {
        characterName: 'Ally Character'
      });
      const { uuid: enemyUuid, goreanId: enemyGoreanId } = await createCharacterWithGroups({}, {
        characterName: 'Enemy Character'
      });

      // Create caster with groups
      const { uuid: casterUuid } = await createCharacterWithGroups({
        Allies: [allyGoreanId],
        Enemies: [enemyGoreanId]
      }, {
        characterName: 'Caster',
        abilities: [{ ability_id: 'war_cry', ability_name: 'War Cry' }]
      });

      const body = createRequestBody({
        caster_uuid: casterUuid,
        ability_id: 'war_cry',
        nearby_uuids: [allyUuid, enemyUuid]
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Check affected includes caster and enemy, but not ally (if activation succeeded)
      if (data.data.activationSuccess) {
        const affectedUuids = data.data.affected.map((a: { uuid: string }) => a.uuid);
        expect(affectedUuids).toContain(casterUuid);
        expect(affectedUuids).toContain(enemyUuid);
        expect(affectedUuids).not.toContain(allyUuid);
      } else {
        expect(data.data.affected.length).toBe(0);
      }
    });

    it('should return empty affected array when groups are empty for all_allies', async () => {
      // Create nearby characters
      const { uuid: nearbyUuid1 } = await createCharacterWithGroups({}, {
        characterName: 'Nearby 1'
      });
      const { uuid: nearbyUuid2 } = await createCharacterWithGroups({}, {
        characterName: 'Nearby 2'
      });

      // Create caster with empty groups
      const { uuid: casterUuid } = await createCharacterWithGroups({
        Allies: [],
        Enemies: []
      }, {
        characterName: 'Caster',
        abilities: [{ ability_id: 'rally_allies', ability_name: 'Rally Allies' }]
      });

      const body = createRequestBody({
        caster_uuid: casterUuid,
        ability_id: 'rally_allies',
        nearby_uuids: [nearbyUuid1, nearbyUuid2]
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // With empty groups, no one should be affected
      if (data.data.affected) {
        expect(data.data.affected.length).toBe(0);
      }
    });

    it('should return empty affected array when groups are empty for all_enemies', async () => {
      // Create nearby characters
      const { uuid: nearbyUuid1 } = await createCharacterWithGroups({}, {
        characterName: 'Nearby 1'
      });

      // Create caster with empty groups
      const { uuid: casterUuid } = await createCharacterWithGroups({
        Allies: [],
        Enemies: []
      }, {
        characterName: 'Caster',
        abilities: [{ ability_id: 'intimidate_enemies', ability_name: 'Intimidate Enemies' }]
      });

      const body = createRequestBody({
        caster_uuid: casterUuid,
        ability_id: 'intimidate_enemies',
        nearby_uuids: [nearbyUuid1]
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // With empty groups, no enemies should be affected
      if (data.data.affected) {
        expect(data.data.affected.length).toBe(0);
      }
    });

    it('should affect multiple allies when multiple are in group', async () => {
      // Create multiple allies
      const { uuid: ally1Uuid, goreanId: ally1Id } = await createCharacterWithGroups({}, {
        characterName: 'Ally 1'
      });
      const { uuid: ally2Uuid, goreanId: ally2Id } = await createCharacterWithGroups({}, {
        characterName: 'Ally 2'
      });
      const { uuid: ally3Uuid, goreanId: ally3Id } = await createCharacterWithGroups({}, {
        characterName: 'Ally 3'
      });

      // Create caster with all three as allies
      const { uuid: casterUuid } = await createCharacterWithGroups({
        Allies: [ally1Id, ally2Id, ally3Id],
        Enemies: []
      }, {
        characterName: 'Caster',
        abilities: [{ ability_id: 'rally_allies', ability_name: 'Rally Allies' }]
      });

      const body = createRequestBody({
        caster_uuid: casterUuid,
        ability_id: 'rally_allies',
        nearby_uuids: [ally1Uuid, ally2Uuid, ally3Uuid]
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // All three allies should be affected (if activation succeeded)
      if (data.data.activationSuccess) {
        const affectedUuids = data.data.affected.map((a: { uuid: string }) => a.uuid);
        expect(affectedUuids).toContain(ally1Uuid);
        expect(affectedUuids).toContain(ally2Uuid);
        expect(affectedUuids).toContain(ally3Uuid);
        expect(affectedUuids.length).toBe(3);
      } else {
        // Check failed - no allies affected
        expect(data.data.affected.length).toBe(0);
      }
    });

    it('should only affect nearby allies even if more are in group', async () => {
      // Create allies - one nearby, one not
      const { uuid: nearbyAllyUuid, goreanId: nearbyAllyId } = await createCharacterWithGroups({}, {
        characterName: 'Nearby Ally'
      });
      const { goreanId: farAllyId } = await createCharacterWithGroups({}, {
        characterName: 'Far Ally'
      });

      // Create caster with both as allies
      const { uuid: casterUuid } = await createCharacterWithGroups({
        Allies: [nearbyAllyId, farAllyId],
        Enemies: []
      }, {
        characterName: 'Caster',
        abilities: [{ ability_id: 'rally_allies', ability_name: 'Rally Allies' }]
      });

      // Only include nearby ally in nearby_uuids
      const body = createRequestBody({
        caster_uuid: casterUuid,
        ability_id: 'rally_allies',
        nearby_uuids: [nearbyAllyUuid]
      });

      const request = createMockPostRequest('/api/gor/combat/use-ability', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Only nearby ally should be affected (if activation succeeded)
      if (data.data.activationSuccess) {
        const affectedUuids = data.data.affected.map((a: { uuid: string }) => a.uuid);
        expect(affectedUuids).toContain(nearbyAllyUuid);
        expect(affectedUuids.length).toBe(1);
      } else {
        expect(data.data.affected.length).toBe(0);
      }
    });
  });

  describe('Control Effects Display Formatting', () => {
    it('should format control effects with caster name and turns left', async () => {
      const { formatGorEffectsForLSL } = await import('@/lib/gor/effectsUtils');

      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'control_stun_1',
          name: 'Stunning Blow',
          category: 'control',
          controlType: 'stun',
          turnsRemaining: 1,
          sceneEffect: false,
          appliedBy: 'Tarl',
          appliedAt: new Date().toISOString()
        },
        {
          effectId: 'control_fear',
          name: 'Fearsome Presence',
          category: 'control',
          controlType: 'fear',
          turnsRemaining: 2,
          sceneEffect: false,
          appliedBy: 'Vella',
          appliedAt: new Date().toISOString()
        }
      ];

      const formatted = formatGorEffectsForLSL(activeEffects);

      expect(formatted).toContain('💤 Control:');
      expect(formatted).toContain('Stunning Blow by Tarl(1 turn left)');
      expect(formatted).toContain('Fearsome Presence by Vella(2 turns left)');
    });

    it('should format control effects with scene duration', async () => {
      const { formatGorEffectsForLSL } = await import('@/lib/gor/effectsUtils');

      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'control_daze',
          name: 'Mind Fog',
          category: 'control',
          controlType: 'daze',
          turnsRemaining: 0,
          sceneEffect: true,
          duration: 'scene',
          appliedBy: 'Wizard',
          appliedAt: new Date().toISOString()
        }
      ];

      const formatted = formatGorEffectsForLSL(activeEffects);

      expect(formatted).toContain('💤 Control:');
      expect(formatted).toContain('Mind Fog by Wizard(scene)');
    });

    it('should show "Unknown" caster when appliedBy is missing', async () => {
      const { formatGorEffectsForLSL } = await import('@/lib/gor/effectsUtils');

      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'control_stun_2',
          name: 'Thunder Strike',
          category: 'control',
          controlType: 'stun',
          turnsRemaining: 2,
          sceneEffect: false,
          appliedAt: new Date().toISOString()
          // appliedBy is intentionally missing
        }
      ];

      const formatted = formatGorEffectsForLSL(activeEffects);

      expect(formatted).toContain('💤 Control:');
      expect(formatted).toContain('Thunder Strike by Unknown(2 turns left)');
    });

    it('should combine stat effects and control effects correctly', async () => {
      const { formatGorEffectsForLSL } = await import('@/lib/gor/effectsUtils');

      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'buff_strength_3',
          name: 'Strength Boost',
          category: 'stat_modifier',
          stat: 'Strength',
          modifier: 3,
          turnsRemaining: 3,
          sceneEffect: false,
          appliedBy: 'Ally',
          appliedAt: new Date().toISOString()
        },
        {
          effectId: 'control_stun_1',
          name: 'Stunning Blow',
          category: 'control',
          controlType: 'stun',
          turnsRemaining: 1,
          sceneEffect: false,
          appliedBy: 'Enemy',
          appliedAt: new Date().toISOString()
        }
      ];

      const formatted = formatGorEffectsForLSL(activeEffects);

      // Should have both sections separated by newline
      expect(formatted).toContain('✨ Str +3(3t)');
      expect(formatted).toContain('\n');
      expect(formatted).toContain('💤 Control:');
      expect(formatted).toContain('Stunning Blow by Enemy(1 turn left)');
    });

    it('should fallback to controlType name when effect name is missing', async () => {
      const { formatGorEffectsForLSL } = await import('@/lib/gor/effectsUtils');

      const activeEffects: ActiveEffect[] = [
        {
          effectId: 'control_charm',
          // name is intentionally missing
          category: 'control',
          controlType: 'charm',
          turnsRemaining: 3,
          sceneEffect: false,
          appliedBy: 'Sorcerer',
          appliedAt: new Date().toISOString()
        }
      ];

      const formatted = formatGorEffectsForLSL(activeEffects);

      expect(formatted).toContain('💤 Control:');
      // Should capitalize the controlType: "charm" -> "Charm"
      expect(formatted).toContain('Charm by Sorcerer(3 turns left)');
    });
  });
});
