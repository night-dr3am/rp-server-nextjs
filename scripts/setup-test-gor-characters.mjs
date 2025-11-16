#!/usr/bin/env node

/**
 * Helper script to create test Gorean characters in the database
 * This is called by test-gor-registration-page.ps1
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function createTestCharacters() {
  try {
    const timestamp = Date.now();

    // Character 1: Player with completed Gorean registration (Warrior)
    const playerUuid = randomUUID(); // Proper UUID format
    const playerUsername = `GorPlayer${timestamp}`;

    const playerUser = await prisma.user.create({
      data: {
        slUuid: playerUuid,
        universe: 'gor',
        username: playerUsername,
        role: 'FREE',
        stats: {
          create: {
            health: 20,
            status: 0,
            hunger: 100,
            thirst: 100,
            goldCoin: 10,
            silverCoin: 50,
            copperCoin: 100
          }
        },
        goreanStats: {
          create: {
            characterName: 'Tarl of Ko-ro-ba',
            agentName: playerUsername,
            title: 'Warrior Captain',
            background: 'Born in Ko-ro-ba, trained in the Scarlet Caste from youth. Known for his skill with the blade.',
            species: 'human',
            speciesCategory: 'sapient',
            speciesVariant: '',
            culture: 'southern_cities',
            cultureType: 'cityState',
            status: 'freeMan',
            slaveType: null, // Not a slave
            statusSubtype: '',
            casteRole: 'warriors',
            casteRoleType: 'highCaste',
            region: 'ar',
            homeStoneName: 'Ko-ro-ba',
            // Stats: 4+3+2+3+3 = 15 (5 base + 10 points)
            strength: 4,
            agility: 3,
            intellect: 2,
            perception: 3,
            charisma: 3,
            statPointsPool: 0,
            statPointsSpent: 10,
            // HP: 50 (human base) + 40 (str 4 * 10) + 10% (warrior caste) + 3 (swordplay) + 4 (unarmed) = 106
            healthMax: 106,
            healthCurrent: 106,
            hungerMax: 100,
            hungerCurrent: 100,
            thirstMax: 100,
            thirstCurrent: 100,
            skills: [
              { skill_id: 'swordplay', skill_name: 'Swordplay', level: 2, xp: 0 },
              { skill_id: 'unarmed_combat', skill_name: 'Unarmed Combat', level: 2, xp: 0 },
              { skill_id: 'hunting', skill_name: 'Hunting', level: 1, xp: 0 }
            ],
            skillsAllocatedPoints: 5,
            skillsSpentPoints: 5, // Level 2 = 2pts, Level 2 = 2pts, Level 1 = 1pt (linear cost)
            activeEffects: [],
            xp: 0,
            registrationCompleted: true
          }
        }
      }
    });

    // Character 2: Admin with completed Gorean registration (Scribe)
    const adminUuid = randomUUID(); // Proper UUID format
    const adminUsername = `GorAdmin${timestamp}`;

    const adminUser = await prisma.user.create({
      data: {
        slUuid: adminUuid,
        universe: 'gor',
        username: adminUsername,
        role: 'FREE',
        stats: {
          create: {
            health: 10,
            status: 0,
            hunger: 100,
            thirst: 100,
            goldCoin: 100,
            silverCoin: 500,
            copperCoin: 1000
          }
        },
        goreanStats: {
          create: {
            characterName: 'Marcus of Ar',
            agentName: adminUsername,
            title: 'First Scribe',
            background: 'Senior scribe of the Blue Caste in the great city of Ar. Keeper of ancient texts and administrator of records.',
            species: 'human',
            speciesCategory: 'sapient',
            speciesVariant: '',
            culture: 'southern_cities',
            cultureType: 'cityState',
            status: 'freeMan',
            slaveType: null, // Not a slave
            statusSubtype: '',
            casteRole: 'scribes',
            casteRoleType: 'highCaste',
            region: 'ar',
            homeStoneName: 'Ar',
            // Stats: 2+2+5+3+3 = 15 (5 base + 10 points)
            strength: 2,
            agility: 2,
            intellect: 5,
            perception: 3,
            charisma: 3,
            statPointsPool: 0,
            statPointsSpent: 10,
            // HP: 50 (human base) + 20 (str 2 * 10) + 0% (scribe caste) = 70
            healthMax: 70,
            healthCurrent: 70,
            hungerMax: 100,
            hungerCurrent: 100,
            thirstMax: 100,
            thirstCurrent: 100,
            skills: [
              { skill_id: 'literacy', skill_name: 'Literacy', level: 2, xp: 0 },
              { skill_id: 'medicine', skill_name: 'Medicine', level: 2, xp: 0 },
              { skill_id: 'cooking', skill_name: 'Cooking', level: 1, xp: 0 }
            ],
            skillsAllocatedPoints: 5,
            skillsSpentPoints: 5, // Level 2 = 2pts, Level 2 = 2pts, Level 1 = 1pt (linear cost)
            activeEffects: [],
            xp: 500,
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
        characterName: 'Tarl of Ko-ro-ba'
      },
      admin: {
        uuid: adminUuid,
        username: adminUsername,
        characterName: 'Marcus of Ar'
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
