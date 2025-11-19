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

    // Character 1: Combat-focused Warrior (Combat + Subterfuge skills)
    const playerUuid = randomUUID();
    const playerUsername = `GorWarrior${timestamp}`;

    const playerUser = await prisma.user.create({
      data: {
        slUuid: playerUuid,
        universe: 'gor',
        username: playerUsername,
        role: 'FREE',
        stats: {
          create: {
            health: 88,
            status: 2, // Combat Mode
            hunger: 85,
            thirst: 90,
            goldCoin: 25,
            silverCoin: 150,
            copperCoin: 300
          }
        },
        goreanStats: {
          create: {
            characterName: 'Tarl of Ko-ro-ba',
            agentName: playerUsername,
            title: 'Warrior Captain',
            background: 'Born in Ko-ro-ba, trained in the Scarlet Caste from youth. Known for his skill with the blade and silent movement. Has seen many battles across the northern regions.',
            species: 'human',
            speciesCategory: 'sapient',
            speciesVariant: '',
            culture: 'southern_cities',
            cultureType: 'cityState',
            socialStatus: 'freeMan',
            slaveType: null,
            statusSubtype: '',
            casteRole: 'warriors',
            casteRoleType: 'highCaste',
            region: 'ar',
            homeStoneName: 'Ko-ro-ba',
            strength: 5,
            agility: 4,
            intellect: 2,
            perception: 2,
            charisma: 2,
            statPointsPool: 0,
            statPointsSpent: 10,
            healthMax: 103, // 50 base + 50 (str 5*10) + 10% warrior + 1 (swordplay) = 110+1 = 111, but damaged
            healthCurrent: 88,
            hungerMax: 100,
            hungerCurrent: 85,
            thirstMax: 100,
            thirstCurrent: 90,
            skills: [
              { skill_id: 'swordplay', skill_name: 'Swordplay', level: 3, xp: 35 }, // Progress toward level 4 (45 needed)
              { skill_id: 'unarmed_combat', skill_name: 'Unarmed Combat', level: 2, xp: 8 }, // Progress toward level 3 (10 needed)
              { skill_id: 'stealth', skill_name: 'Stealth', level: 2, xp: 0 },
              { skill_id: 'capture', skill_name: 'Capture & Restraint', level: 1, xp: 5 } // Progress toward level 2 (10 needed)
            ],
            skillsAllocatedPoints: 10,
            skillsSpentPoints: 8, // 3+2+2+1 = 8 pts (linear costs)
            abilities: [
              { ability_id: 'combat_expertise', ability_name: 'Combat Expertise', uses: 3 },
              { ability_id: 'battle_cry', ability_name: 'Battle Cry', uses: 5 }
            ],
            activeEffects: [],
            xp: 1250,
            registrationCompleted: true
          }
        }
      }
    });

    // Character 2: Scholarly Scribe (Mental + Crafting skills)
    const adminUuid = randomUUID();
    const adminUsername = `GorScribe${timestamp}`;

    const adminUser = await prisma.user.create({
      data: {
        slUuid: adminUuid,
        universe: 'gor',
        username: adminUsername,
        role: 'FREE',
        stats: {
          create: {
            health: 70,
            status: 3, // RP Mode
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
            background: 'Senior scribe of the Blue Caste in the great city of Ar. Keeper of ancient texts and administrator of records. Also skilled in healing arts and culinary preparation.',
            species: 'human',
            speciesCategory: 'sapient',
            speciesVariant: '',
            culture: 'southern_cities',
            cultureType: 'cityState',
            socialStatus: 'freeMan',
            slaveType: null,
            statusSubtype: '',
            casteRole: 'scribes',
            casteRoleType: 'highCaste',
            region: 'ar',
            homeStoneName: 'Ar',
            strength: 2,
            agility: 2,
            intellect: 5,
            perception: 3,
            charisma: 3,
            statPointsPool: 0,
            statPointsSpent: 10,
            healthMax: 70, // 50 base + 20 (str 2*10) + 0% scribe
            healthCurrent: 70,
            hungerMax: 100,
            hungerCurrent: 100,
            thirstMax: 100,
            thirstCurrent: 100,
            skills: [
              { skill_id: 'literacy', skill_name: 'Literacy', level: 4, xp: 50 }, // Progress toward level 5 (70 needed)
              { skill_id: 'medicine', skill_name: 'Medicine', level: 3, xp: 15 }, // Progress toward level 4 (45 needed)
              { skill_id: 'cooking', skill_name: 'Cooking', level: 2, xp: 20 }, // Progress toward level 3 (25 needed)
              { skill_id: 'brewing', skill_name: 'Brewing', level: 1, xp: 0 }
            ],
            skillsAllocatedPoints: 12,
            skillsSpentPoints: 10, // 4+3+2+1 = 10 pts
            abilities: [
              { ability_id: 'tactical_command', ability_name: 'Tactical Command', uses: 2 }
            ],
            activeEffects: [],
            xp: 2800,
            registrationCompleted: true
          }
        }
      }
    });

    // Character 3: Versatile Hunter (Survival + Social + Combat skills)
    const hunterUuid = randomUUID();
    const hunterUsername = `GorHunter${timestamp}`;

    const hunterUser = await prisma.user.create({
      data: {
        slUuid: hunterUuid,
        universe: 'gor',
        username: hunterUsername,
        role: 'FREE',
        stats: {
          create: {
            health: 77,
            status: 1, // Survival Mode
            hunger: 60,
            thirst: 70,
            goldCoin: 5,
            silverCoin: 80,
            copperCoin: 250
          }
        },
        goreanStats: {
          create: {
            characterName: 'Kron of the Barrens',
            agentName: hunterUsername,
            title: 'Master Tracker',
            background: 'A skilled hunter from the northern forests of Torvaldsland. Expert in tracking quarry through the wilderness and surviving harsh conditions. Can shoot a verr at 200 paces.',
            species: 'human',
            speciesCategory: 'sapient',
            speciesVariant: '',
            culture: 'torvaldsland',
            cultureType: 'tribal',
            socialStatus: 'freeMan',
            slaveType: null,
            statusSubtype: '',
            casteRole: 'warriors', // Tribal warrior/hunter
            casteRoleType: 'highCaste',
            region: 'torvaldsland',
            homeStoneName: 'Skjern',
            strength: 3,
            agility: 4,
            intellect: 2,
            perception: 5,
            charisma: 1,
            statPointsPool: 0,
            statPointsSpent: 10,
            healthMax: 86, // 50 base + 30 (str 3*10) + 10% warrior + 3 (hunting level 3) + 1 (archery level 1) = 89+3+1 = 93, but damaged
            healthCurrent: 77,
            hungerMax: 100,
            hungerCurrent: 60,
            thirstMax: 100,
            thirstCurrent: 70,
            skills: [
              { skill_id: 'hunting', skill_name: 'Hunting', level: 3, xp: 40 }, // Progress toward level 4 (45 needed)
              { skill_id: 'archery', skill_name: 'Archery', level: 3, xp: 5 }, // Progress toward level 4 (70 needed)
              { skill_id: 'fishing', skill_name: 'Fishing', level: 2, xp: 18 }, // Progress toward level 3 (25 needed)
              { skill_id: 'stealth', skill_name: 'Stealth', level: 1, xp: 7 } // Progress toward level 2 (10 needed)
            ],
            skillsAllocatedPoints: 11,
            skillsSpentPoints: 9, // 3+3+2+1 = 9 pts
            abilities: [
              { ability_id: 'second_wind', ability_name: 'Second Wind', uses: 1 },
              { ability_id: 'capture_throw', ability_name: 'Capture Throw', uses: 2 }
            ],
            activeEffects: [],
            xp: 1800,
            registrationCompleted: true
          }
        }
      }
    });

    // Character 4: Kajira Slave (Social + Crafting skills)
    const slaveUuid = randomUUID();
    const slaveUsername = `GorKajira${timestamp}`;

    const slaveUser = await prisma.user.create({
      data: {
        slUuid: slaveUuid,
        universe: 'gor',
        username: slaveUsername,
        role: 'FREE',
        stats: {
          create: {
            health: 55,
            status: 3, // RP Mode
            hunger: 95,
            thirst: 90,
            goldCoin: 0,
            silverCoin: 3,
            copperCoin: 15
          }
        },
        goreanStats: {
          create: {
            characterName: 'Lara',
            agentName: slaveUsername,
            title: 'Pleasure Slave',
            background: 'A highly trained pleasure slave of Ar. Skilled in the arts of serving, cooking exquisite meals, and entertaining her masters. Known for her grace and obedience.',
            species: 'human',
            speciesCategory: 'sapient',
            speciesVariant: '',
            culture: 'southern_cities',
            cultureType: 'cityState',
            socialStatus: 'kajira',
            slaveType: 'pleasure_slave',
            statusSubtype: '',
            casteRole: 'pleasure_slave', // Slave subtype as role
            casteRoleType: 'special',
            region: 'ar',
            homeStoneName: '', // Slaves typically have no home stone
            strength: 1,
            agility: 3,
            intellect: 3,
            perception: 2,
            charisma: 6,
            statPointsPool: 0,
            statPointsSpent: 10,
            healthMax: 60, // 50 base + 10 (str 1*10) + 0% (no combat caste)
            healthCurrent: 55,
            hungerMax: 100,
            hungerCurrent: 95,
            thirstMax: 100,
            thirstCurrent: 90,
            skills: [
              { skill_id: 'sexual_pleasing', skill_name: 'Sexual Pleasing', level: 4, xp: 60 }, // Progress toward level 5 (70 needed)
              { skill_id: 'cooking', skill_name: 'Cooking', level: 3, xp: 30 }, // Progress toward level 4 (45 needed)
              { skill_id: 'stealth', skill_name: 'Stealth', level: 1, xp: 0 },
              { skill_id: 'brewing', skill_name: 'Brewing', level: 1, xp: 3 } // Progress toward level 2 (10 needed)
            ],
            skillsAllocatedPoints: 11,
            skillsSpentPoints: 9, // 4+3+1+1 = 9 pts
            abilities: [
              { ability_id: 'tactical_command', ability_name: 'Tactical Command', uses: 1 }
            ],
            activeEffects: [],
            xp: 3200,
            registrationCompleted: true
          }
        }
      }
    });

    // Output JSON for PowerShell to parse
    console.log(JSON.stringify({
      success: true,
      warrior: {
        uuid: playerUuid,
        username: playerUsername,
        characterName: 'Tarl of Ko-ro-ba',
        skillSummary: 'Combat + Subterfuge'
      },
      scribe: {
        uuid: adminUuid,
        username: adminUsername,
        characterName: 'Marcus of Ar',
        skillSummary: 'Mental + Crafting'
      },
      hunter: {
        uuid: hunterUuid,
        username: hunterUsername,
        characterName: 'Kron of the Barrens',
        skillSummary: 'Survival + Combat'
      },
      kajira: {
        uuid: slaveUuid,
        username: slaveUsername,
        characterName: 'Lara',
        skillSummary: 'Social + Crafting (Slave)'
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
