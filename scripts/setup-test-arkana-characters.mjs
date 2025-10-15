#!/usr/bin/env node

/**
 * Helper script to create test Arkana characters in the database
 * This is called by test-arkana-registration-page.ps1
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function createTestCharacters() {
  try {
    const timestamp = Date.now();

    // Character 1: Player with completed registration
    const playerUuid = randomUUID(); // Proper UUID format
    const playerUsername = `ArkanaPlayer${timestamp}`;

    const playerUser = await prisma.user.create({
      data: {
        slUuid: playerUuid,
        universe: 'arkana',
        username: playerUsername,
        role: 'FREE',
        stats: {
          create: {
            health: 15,
            status: 0,
            hunger: 100,
            thirst: 100,
            goldCoin: 0,
            silverCoin: 0,
            copperCoin: 10
          }
        },
        arkanaStats: {
          create: {
            characterName: 'Cyber Knight',
            agentName: playerUsername,
            aliasCallsign: 'CK-001',
            faction: 'Independent',
            conceptRole: 'Warrior',
            job: 'Mercenary',
            background: 'Former corporate enforcer turned independent contractor',
            race: 'Human',
            subrace: 'Augmented',
            archetype: 'Synthral',
            physical: 3,
            dexterity: 3,
            mental: 2,
            perception: 2,
            hitPoints: 15,
            inherentPowers: ['Enhanced Reflexes'],
            weaknesses: [],
            flaws: [],
            commonPowers: ['Dodge'],
            archetypePowers: ['Neural Interface'],
            perks: ['Combat Training'],
            magicSchools: [],
            magicWeaves: [],
            cybernetics: ['Neural Implant'],
            cyberneticAugments: ['Combat Processor'],
            skills: [
              { skill_id: 'skill_combat_arts', skill_name: 'Combat Arts', level: 2 },
              { skill_id: 'skill_firearms', skill_name: 'Firearms', level: 2 },
              { skill_id: 'skill_athletics', skill_name: 'Athletics', level: 1 }
            ],
            skillsAllocatedPoints: 5,
            skillsSpentPoints: 5,
            credits: 500,
            chips: 50,
            xp: 0,
            arkanaRole: 'player',
            registrationCompleted: true
          }
        }
      }
    });

    // Character 2: Admin with completed registration
    const adminUuid = randomUUID(); // Proper UUID format
    const adminUsername = `ArkanaAdmin${timestamp}`;

    const adminUser = await prisma.user.create({
      data: {
        slUuid: adminUuid,
        universe: 'arkana',
        username: adminUsername,
        role: 'FREE',
        stats: {
          create: {
            health: 20,
            status: 0,
            hunger: 100,
            thirst: 100,
            goldCoin: 0,
            silverCoin: 0,
            copperCoin: 10
          }
        },
        arkanaStats: {
          create: {
            characterName: 'Admin Overseer',
            agentName: adminUsername,
            aliasCallsign: 'ADMIN-001',
            faction: 'System Administrator',
            conceptRole: 'Overseer',
            job: 'Administrator',
            background: 'System administrator with full access',
            race: 'Human',
            subrace: 'Standard',
            archetype: 'Arcanist',
            physical: 4,
            dexterity: 4,
            mental: 4,
            perception: 4,
            hitPoints: 20,
            inherentPowers: ['Admin Access'],
            weaknesses: [],
            flaws: [],
            commonPowers: ['Analyze', 'Dodge', 'Focus'],
            archetypePowers: ['Arcane Mastery', 'Spell Weaving'],
            perks: ['Admin Powers', 'System Override'],
            magicSchools: ['Evocation', 'Abjuration', 'Divination'],
            magicWeaves: ['Fire', 'Force', 'Protection'],
            cybernetics: ['Admin Implant'],
            cyberneticAugments: ['Full System Access'],
            skills: [
              { skill_id: 'skill_lore', skill_name: 'Lore', level: 3 },
              { skill_id: 'skill_ritualism', skill_name: 'Ritualism', level: 2 },
              { skill_id: 'skill_hack', skill_name: 'Hack', level: 2 },
              { skill_id: 'skill_engineering', skill_name: 'Engineering', level: 1 }
            ],
            skillsAllocatedPoints: 8,
            skillsSpentPoints: 8,
            credits: 10000,
            chips: 1000,
            xp: 1000,
            arkanaRole: 'admin',
            registrationCompleted: true
          }
        }
      }
    });

    // Output JSON for PowerShell to parse
    console.log(JSON.stringify({
      success: true,
      player: {
        uuid: playerUuid,
        username: playerUsername,
        characterName: 'Cyber Knight'
      },
      admin: {
        uuid: adminUuid,
        username: adminUsername,
        characterName: 'Admin Overseer'
      }
    }));

  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error.message
    }));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createTestCharacters();
