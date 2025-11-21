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

// Helper to create test body with signature
function createAttackBody(data: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const universe = 'gor';
  return {
    ...data,
    universe,
    timestamp,
    signature: generateSignature(timestamp, universe)
  };
}

// Helper to create a test Gorean character
async function createTestGoreanCharacter(overrides: Record<string, unknown> = {}) {
  const uuid = crypto.randomUUID();
  const username = `TestWarrior${Date.now()}`;

  const user = await prisma.user.create({
    data: {
      slUuid: uuid,
      universe: 'gor',
      username,
      role: 'FREE',
      stats: {
        create: {
          health: 80,
          status: 2, // Combat Mode
          hunger: 100,
          thirst: 100,
          goldCoin: 10,
          silverCoin: 50,
          copperCoin: 100
        }
      },
      goreanStats: {
        create: {
          characterName: overrides.characterName as string || 'Test Warrior',
          agentName: username,
          title: 'Warrior',
          species: 'human',
          speciesCategory: 'sapient',
          culture: 'southern_cities',
          cultureType: 'cityState',
          socialStatus: 'freeMan',
          casteRole: 'warriors',
          casteRoleType: 'highCaste',
          strength: overrides.strength as number || 3,
          agility: overrides.agility as number || 3,
          intellect: overrides.intellect as number || 2,
          perception: overrides.perception as number || 2,
          charisma: overrides.charisma as number || 2,
          statPointsPool: 0,
          statPointsSpent: 10,
          healthMax: overrides.healthMax !== undefined ? overrides.healthMax as number : 88,
          healthCurrent: overrides.healthCurrent !== undefined ? overrides.healthCurrent as number : 88,
          hungerMax: 100,
          hungerCurrent: 100,
          thirstMax: 100,
          thirstCurrent: 100,
          skills: overrides.skills || [
            { skill_id: 'swordplay', skill_name: 'Swordplay', level: 2, xp: 0 },
            { skill_id: 'unarmed_combat', skill_name: 'Unarmed Combat', level: 1, xp: 0 }
          ],
          skillsAllocatedPoints: 5,
          skillsSpentPoints: 3,
          abilities: [],
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

describe('POST /api/gor/combat/attack', () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Validation', () => {
    it('should reject request without attacker_uuid', async () => {
      const body = createAttackBody({
        target_uuid: crypto.randomUUID(),
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'attacker_uuid');
    });

    it('should reject request without target_uuid', async () => {
      const body = createAttackBody({
        attacker_uuid: crypto.randomUUID(),
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'target_uuid');
    });

    it('should reject invalid attack_type', async () => {
      const body = createAttackBody({
        attacker_uuid: crypto.randomUUID(),
        target_uuid: crypto.randomUUID(),
        attack_type: 'magic' // Invalid
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'attack_type');
    });

    it('should reject invalid weapon_type', async () => {
      const body = createAttackBody({
        attacker_uuid: crypto.randomUUID(),
        target_uuid: crypto.randomUUID(),
        attack_type: 'melee_weapon',
        weapon_type: 'laser_gun' // Invalid
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'weapon_type');
    });

    it('should reject self-attack', async () => {
      const { uuid } = await createTestGoreanCharacter();

      const body = createAttackBody({
        attacker_uuid: uuid,
        target_uuid: uuid, // Same as attacker
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'yourself');
    });

    it('should reject invalid signature', async () => {
      const body = {
        attacker_uuid: crypto.randomUUID(),
        target_uuid: crypto.randomUUID(),
        attack_type: 'melee_unarmed',
        universe: 'gor',
        timestamp: new Date().toISOString(),
        signature: 'invalid_signature'
      };

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'signature');
    });
  });

  describe('Weapon Validation', () => {
    it('should reject unarmed attack with weapon', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter();
      const { uuid: targetUuid } = await createTestGoreanCharacter();

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_unarmed',
        weapon_type: 'medium_weapon' // Invalid for unarmed
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Unarmed attacks');
    });

    it('should reject weapon attack without weapon', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter();
      const { uuid: targetUuid } = await createTestGoreanCharacter();

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_weapon',
        weapon_type: 'unarmed' // Invalid for weapon attack
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'require a weapon');
    });

    it('should reject ranged attack without bow/crossbow', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter();
      const { uuid: targetUuid } = await createTestGoreanCharacter();

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'ranged',
        weapon_type: 'medium_weapon' // Invalid for ranged
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'bow or crossbow');
    });
  });

  describe('Combat Mode Validation', () => {
    it('should reject attack when attacker is not in one of IC modes', async () => {
      // Create attacker in RP Mode (status 3)
      const attackerUuid = crypto.randomUUID();
      await prisma.user.create({
        data: {
          slUuid: attackerUuid,
          universe: 'gor',
          username: `RPPlayer${Date.now()}`,
          role: 'FREE',
          stats: {
            create: {
              health: 80,
              status: 4, // OOC Mode
              hunger: 100,
              thirst: 100
            }
          },
          goreanStats: {
            create: {
              characterName: 'RP Player',
              agentName: 'rpplayer',
              species: 'human',
              speciesCategory: 'sapient',
              culture: 'southern_cities',
              cultureType: 'cityState',
              socialStatus: 'freeMan',
              strength: 3, agility: 3, intellect: 2, perception: 2, charisma: 2,
              statPointsPool: 0, statPointsSpent: 10,
              healthMax: 80, healthCurrent: 80,
              hungerMax: 100, hungerCurrent: 100, thirstMax: 100, thirstCurrent: 100,
              skills: [], skillsAllocatedPoints: 5, skillsSpentPoints: 0,
              abilities: [], activeEffects: [], liveStats: {}, xp: 0,
              registrationCompleted: true
            }
          }
        }
      });

      const { uuid: targetUuid } = await createTestGoreanCharacter();

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Must be in Full, Survival, Combat or RP mode to attack');
    });
  });

  describe('Successful Attacks', () => {
    it('should perform successful melee unarmed attack', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter({
        characterName: 'Tarl',
        strength: 4,
        skills: [
          { skill_id: 'unarmed_combat', skill_name: 'Unarmed Combat', level: 3, xp: 0 }
        ]
      });
      const { uuid: targetUuid } = await createTestGoreanCharacter({
        characterName: 'Marcus',
        healthCurrent: 50
      });

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_unarmed',
        weapon_type: 'unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data).toHaveProperty('hit');
      expect(data.data).toHaveProperty('damage');
      expect(data.data).toHaveProperty('roll');
      expect(data.data).toHaveProperty('damageBreakdown');
      expect(data.data.attacker.name).toBe('Tarl');
      expect(data.data.target.name).toBe('Marcus');
    });

    it('should perform successful melee weapon attack', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter({
        strength: 5, // High strength for better hit chance
        skills: [
          { skill_id: 'swordplay', skill_name: 'Swordplay', level: 3, xp: 0 }
        ]
      });
      const { uuid: targetUuid } = await createTestGoreanCharacter({
        agility: 1 // Low defense to ensure hit
      });

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_weapon',
        weapon_type: 'medium_weapon'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      if (data.data.hit) {
        expect(data.data.damageBreakdown.baseDamage).toBe(4); // medium_weapon base damage
        expect(data.data.damageBreakdown.skillBonus).toBe(3); // swordplay level 3
      } else {
        // On miss, just verify attack was processed
        expect(data.data.damage).toBe(0);
      }
    });

    it('should perform successful ranged attack', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter({
        perception: 5, // High perception for better hit chance
        skills: [
          { skill_id: 'archery', skill_name: 'Archery', level: 2, xp: 0 }
        ]
      });
      const { uuid: targetUuid } = await createTestGoreanCharacter({
        agility: 1 // Low defense to ensure hit
      });

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'ranged',
        weapon_type: 'bow'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      if (data.data.hit) {
        expect(data.data.damageBreakdown.baseDamage).toBe(4); // bow base damage
        expect(data.data.damageBreakdown.skillBonus).toBe(2); // archery level 2
      } else {
        // On miss, just verify attack was processed
        expect(data.data.damage).toBe(0);
      }
    });

    it('should reduce target health on hit', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter({
        strength: 5 // High strength for guaranteed damage
      });
      const { uuid: targetUuid } = await createTestGoreanCharacter({
        healthCurrent: 50,
        healthMax: 88
      });

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Check database was updated
      const target = await prisma.user.findFirst({
        where: { slUuid: targetUuid },
        include: { goreanStats: true }
      });

      if (data.data.hit) {
        expect(target?.goreanStats?.healthCurrent).toBeLessThan(50);
        expect(data.data.target.health).toBeLessThan(50);
      } else {
        expect(target?.goreanStats?.healthCurrent).toBe(50);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should not allow attacking unconscious target', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter();
      const { uuid: targetUuid } = await createTestGoreanCharacter({
        healthCurrent: 0 // Unconscious
      });

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'unconscious');
    });

    it('should return 404 for non-existent attacker', async () => {
      const { uuid: targetUuid } = await createTestGoreanCharacter();

      const body = createAttackBody({
        attacker_uuid: crypto.randomUUID(), // Non-existent
        target_uuid: targetUuid,
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Attacker not found');
    });

    it('should return 404 for non-existent target', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter();

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: crypto.randomUUID(), // Non-existent
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectError(data, 'Target not found');
    });

    it('should mark target as unconscious when health reaches 0', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter({
        strength: 5
      });
      const { uuid: targetUuid } = await createTestGoreanCharacter({
        healthCurrent: 1 // Very low health
      });

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      if (data.data.hit) {
        // Target should be unconscious
        expect(data.data.target.health).toBe(0);
        expect(data.data.target.unconscious).toBe(true);
      }
    });

    it('should create combat event', async () => {
      const { uuid: attackerUuid, user: attackerUser } = await createTestGoreanCharacter();
      const { uuid: targetUuid } = await createTestGoreanCharacter();

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      await POST(request);

      // Check event was created
      const event = await prisma.event.findFirst({
        where: {
          userId: attackerUser.id,
          type: 'COMBAT_ATTACK'
        },
        orderBy: { timestamp: 'desc' }
      });

      expect(event).toBeTruthy();
      expect(event?.details).toHaveProperty('attackType', 'melee_unarmed');
    });
  });

  describe('Different Weapon Types', () => {
    it('should use correct base damage for each weapon type', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter({
        strength: 5, // High stats to improve hit chance
        perception: 5,
        agility: 5,
        skills: [
          { skill_id: 'swordplay', skill_name: 'Swordplay', level: 3, xp: 0 },
          { skill_id: 'archery', skill_name: 'Archery', level: 3, xp: 0 }
        ]
      });

      const weaponTests = [
        { weaponType: 'light_weapon', expectedBase: 3, attackType: 'melee_weapon' },
        { weaponType: 'heavy_weapon', expectedBase: 5, attackType: 'melee_weapon' },
        { weaponType: 'crossbow', expectedBase: 5, attackType: 'ranged' }
      ];

      for (const test of weaponTests) {
        // Create weak target to ensure hit
        const { uuid: targetUuid } = await createTestGoreanCharacter({
          agility: 1 // Low defense
        });

        const body = createAttackBody({
          attacker_uuid: attackerUuid,
          target_uuid: targetUuid,
          attack_type: test.attackType,
          weapon_type: test.weaponType
        });

        const request = createMockPostRequest('/api/gor/combat/attack', body);
        const response = await POST(request);
        const data = await parseJsonResponse(response);

        expectSuccess(data);
        // damageBreakdown should always show the weapon base damage regardless of hit
        // Check if hit - if we hit, verify the base damage; if miss, the test is inconclusive for this iteration
        if (data.data.hit) {
          expect(data.data.damageBreakdown.baseDamage).toBe(test.expectedBase);
        } else {
          // On miss, damage is 0 but we can verify the attack was processed
          expect(data.data.damage).toBe(0);
        }
      }
    });
  });

  describe('Contested Roll Mechanics', () => {
    it('should include both attacker and defender roll totals in response', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter({
        strength: 3
      });
      const { uuid: targetUuid } = await createTestGoreanCharacter({
        agility: 3
      });

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify contested roll fields exist
      expect(data.data).toHaveProperty('roll'); // Attacker roll
      expect(data.data).toHaveProperty('defenderRoll');
      expect(data.data).toHaveProperty('attackerTotal');
      expect(data.data).toHaveProperty('defenderTotal');

      // Verify rolls are valid d20 values
      expect(data.data.roll).toBeGreaterThanOrEqual(1);
      expect(data.data.roll).toBeLessThanOrEqual(20);
      expect(data.data.defenderRoll).toBeGreaterThanOrEqual(1);
      expect(data.data.defenderRoll).toBeLessThanOrEqual(20);
    });

    it('should include detailed breakdown strings in response', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter({
        strength: 3
      });
      const { uuid: targetUuid } = await createTestGoreanCharacter({
        agility: 3
      });

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify breakdown strings exist
      expect(data.data).toHaveProperty('attackerBreakdown');
      expect(data.data).toHaveProperty('defenderBreakdown');

      // Verify format includes d20 roll
      expect(data.data.attackerBreakdown).toContain('d20(');
      expect(data.data.defenderBreakdown).toContain('d20(');

      // Verify format includes stat name
      expect(data.data.attackerBreakdown).toContain('Strength[');
      expect(data.data.defenderBreakdown).toContain('Agility[');
    });
  });

  describe('Message Format', () => {
    it('should format message with both player names and rolls', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter({
        characterName: 'Tarl Cabot',
        strength: 4
      });
      const { uuid: targetUuid } = await createTestGoreanCharacter({
        characterName: 'Marcus',
        agility: 2
      });

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Decode URL-encoded message for assertion checks
      const decodedMessage = decodeURIComponent(data.data.message);

      // Message should contain both character names
      expect(decodedMessage).toContain('Tarl Cabot');
      expect(decodedMessage).toContain('Marcus');

      // Message should contain dice roll indicators
      expect(decodedMessage).toContain('d20(');

      // Message should contain 'vs' separator
      expect(decodedMessage).toContain(' vs ');

      // Message should contain result indicator
      expect(decodedMessage).toMatch(/→ (Hit!|Miss!|Critical)/);
    });

    it('should show damage breakdown when hit succeeds', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter({
        strength: 5, // High strength for likely hit
        skills: [
          { skill_id: 'unarmed_combat', skill_name: 'Unarmed Combat', level: 2, xp: 0 }
        ]
      });
      const { uuid: targetUuid } = await createTestGoreanCharacter({
        agility: 1 // Low agility for likely hit
      });

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      if (data.data.hit) {
        // Decode URL-encoded message for assertion checks
        const decodedMessage = decodeURIComponent(data.data.message);

        // Message should contain Damage: breakdown
        expect(decodedMessage).toContain('Damage:');
        // Pattern like 2+6+2=10 (normal) or (2+6+2)×2=20 (critical)
        expect(decodedMessage).toMatch(/(\(?\d+\+\d+\+\d+\)?)(×2)?=\d+/);
      }
    });
  });

  describe('Stat Tier Modifiers', () => {
    it('should calculate correct tier modifier for strength 1 (-2)', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter({
        strength: 1,
        skills: []
      });
      const { uuid: targetUuid } = await createTestGoreanCharacter({
        agility: 2
      });

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.attackModifier).toBe(-2); // Tier -2, no skill bonus
    });

    it('should calculate correct tier modifier for strength 3 (+2)', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter({
        strength: 3,
        skills: []
      });
      const { uuid: targetUuid } = await createTestGoreanCharacter({
        agility: 2
      });

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.attackModifier).toBe(2); // Tier +2, no skill bonus
    });

    it('should calculate correct tier modifier for strength 5 (+6)', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter({
        strength: 5,
        skills: []
      });
      const { uuid: targetUuid } = await createTestGoreanCharacter({
        agility: 2
      });

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.attackModifier).toBe(6); // Tier +6, no skill bonus
    });

    it('should include skill bonus in attack modifier', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter({
        strength: 3,
        skills: [
          { skill_id: 'unarmed_combat', skill_name: 'Unarmed Combat', level: 3, xp: 0 }
        ]
      });
      const { uuid: targetUuid } = await createTestGoreanCharacter({
        agility: 2
      });

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.skillBonus).toBe(3);
      expect(data.data.attackModifier).toBe(5); // Tier +2 + skill 3 = +5
    });
  });

  describe('Contested Roll Edge Cases', () => {
    it('should miss when attacker total equals defender total (tie goes to defender)', async () => {
      // This is a probabilistic test - we verify the rule is applied correctly
      // by checking that hit = attackerTotal > defenderTotal (not >=)
      const { uuid: attackerUuid } = await createTestGoreanCharacter({
        strength: 3
      });
      const { uuid: targetUuid } = await createTestGoreanCharacter({
        agility: 3
      });

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);

      // Verify the hit logic: attacker wins only if total > defender total
      if (data.data.attackerTotal === data.data.defenderTotal) {
        expect(data.data.hit).toBe(false); // Ties go to defender
      } else if (data.data.attackerTotal > data.data.defenderTotal) {
        // Should be hit unless critical miss
        if (data.data.roll !== 1) {
          expect(data.data.hit).toBe(true);
        }
      } else {
        expect(data.data.hit).toBe(false);
      }
    });

    it('should calculate defender total correctly with agility modifier', async () => {
      const { uuid: attackerUuid } = await createTestGoreanCharacter({
        strength: 2
      });
      const { uuid: targetUuid } = await createTestGoreanCharacter({
        agility: 4 // Should give +4 tier modifier
      });

      const body = createAttackBody({
        attacker_uuid: attackerUuid,
        target_uuid: targetUuid,
        attack_type: 'melee_unarmed'
      });

      const request = createMockPostRequest('/api/gor/combat/attack', body);
      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expectSuccess(data);
      expect(data.data.defenseModifier).toBe(4); // Agility 4 = +4 tier modifier
      // defenderTotal = defenderRoll + defenseModifier
      expect(data.data.defenderTotal).toBe(data.data.defenderRoll + 4);
    });
  });
});
