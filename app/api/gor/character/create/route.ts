import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { goreanCharacterCreateSchema } from '@/lib/validation';
import { validateProfileToken } from '@/lib/profileTokenUtils';
import { calculateHealthMax } from '@/lib/gor/types';
import { loadAllGoreanData, getSpeciesById, getCasteById, getCultureById, getTribalRoleById } from '@/lib/gorData';

export async function POST(request: NextRequest) {
  try {
    // Load Gorean data files (required for species/culture/caste lookups)
    await loadAllGoreanData();

    const body = await request.json();

    // Validate input
    const { error, value } = goreanCharacterCreateSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { token, universe, ...characterData } = value;

    // Validate skill maxInitialLevel constraints
    if (characterData.skills && Array.isArray(characterData.skills)) {
      const { getSkillById } = await import('@/lib/gorData');
      for (const skill of characterData.skills) {
        const skillData = getSkillById(skill.skill_id);
        if (skillData && skill.level > skillData.maxInitialLevel) {
          return NextResponse.json(
            {
              success: false,
              error: `Skill "${skill.skill_name}" level ${skill.level} exceeds maximum initial level ${skillData.maxInitialLevel}`
            },
            { status: 400 }
          );
        }
      }
    }

    // Load species data early for skill validation
    const species = getSpeciesById(characterData.species);
    if (!species) {
      return NextResponse.json(
        { success: false, error: `Invalid species: ${characterData.species}` },
        { status: 400 }
      );
    }

    // Validate skills are applicable to species
    if (characterData.skills && Array.isArray(characterData.skills)) {
      const { getSkillById } = await import('@/lib/gorData');
      for (const skill of characterData.skills) {
        const skillData = getSkillById(skill.skill_id);
        if (skillData && skillData.applicableSpecies && !skillData.applicableSpecies.includes(species.category)) {
          return NextResponse.json(
            {
              success: false,
              error: `Skill "${skill.skill_name}" is not available for ${species.name} (${species.category} species)`
            },
            { status: 400 }
          );
        }
      }
    }

    // Validate abilities
    if (characterData.abilities && Array.isArray(characterData.abilities)) {
      const { getAbilityById, calculateAbilityCost, isAbilityAvailable } = await import('@/lib/gorData');

      // Validate each ability exists and calculate total cost
      let calculatedAbilityCost = 0;
      for (const ability of characterData.abilities) {
        const abilityData = getAbilityById(ability.ability_id);
        if (!abilityData) {
          return NextResponse.json(
            {
              success: false,
              error: `Invalid ability: ${ability.ability_name}`
            },
            { status: 400 }
          );
        }

        // Check if ability is available to this character
        const availabilityCheck = isAbilityAvailable(abilityData, {
          species: species,
          caste: characterData.casteRole,
          status: characterData.status,
          skills: characterData.skills,
          stats: {
            strength: characterData.strength,
            agility: characterData.agility,
            intellect: characterData.intellect,
            perception: characterData.perception,
            charisma: characterData.charisma,
            pool: 0,
            spent: 0
          }
        });

        if (!availabilityCheck.available) {
          return NextResponse.json(
            {
              success: false,
              error: `Ability "${ability.ability_name}" is not available: ${availabilityCheck.reason}`
            },
            { status: 400 }
          );
        }

        calculatedAbilityCost += calculateAbilityCost(ability.ability_id);
      }

      // Verify ability points spent matches calculation
      if (calculatedAbilityCost !== characterData.abilitiesSpentPoints) {
        return NextResponse.json(
          {
            success: false,
            error: `Ability points calculation mismatch. Expected ${calculatedAbilityCost} but got ${characterData.abilitiesSpentPoints}`
          },
          { status: 400 }
        );
      }

      // Verify spent doesn't exceed allocated
      if (characterData.abilitiesSpentPoints > characterData.abilitiesAllocatedPoints) {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot spend more ability points (${characterData.abilitiesSpentPoints}) than allocated (${characterData.abilitiesAllocatedPoints})`
          },
          { status: 400 }
        );
      }
    }

    // Validate JWT token
    const tokenValidation = await validateProfileToken(token);
    if (!tokenValidation.valid) {
      return NextResponse.json(
        { success: false, error: tokenValidation.error || 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const profileToken = tokenValidation.profileToken!;
    const user = profileToken.user;

    // Verify token is for Gor universe (case-insensitive)
    if (user.universe.toLowerCase() !== universe.toLowerCase() || universe.toLowerCase() !== 'gor') {
      return NextResponse.json(
        { success: false, error: 'Token is not valid for Gor universe' },
        { status: 401 }
      );
    }

    // Load culture data for HP calculation (species already loaded earlier for validation)
    const culture = getCultureById(characterData.culture);

    // Load caste or tribal role data for HP calculation
    let casteOrRoleData;
    if (characterData.casteRole && culture) {
      if (culture.hasCastes) {
        casteOrRoleData = getCasteById(characterData.casteRole);
      } else {
        casteOrRoleData = getTribalRoleById(culture.id, characterData.casteRole);
      }
    }

    // Calculate derived stats
    const healthMax = calculateHealthMax(
      characterData.strength,
      species,
      casteOrRoleData,
      characterData.skills
    );
    const statPointsSpent = (characterData.strength - 1) + (characterData.agility - 1) +
                            (characterData.intellect - 1) + (characterData.perception - 1) +
                            (characterData.charisma - 1);

    // Base Gorean stats data for both create and update
    const baseGoreanStatsData = {
      userId: user.id,

      // Identity
      characterName: characterData.characterName,
      agentName: characterData.agentName,
      title: characterData.title || null,
      background: characterData.background || null,

      // Species
      species: characterData.species,
      speciesCategory: characterData.speciesCategory,
      speciesVariant: characterData.speciesVariant || null,

      // Culture/Origin
      culture: characterData.culture,
      cultureType: characterData.cultureType,

      // Status
      status: characterData.status,
      slaveType: characterData.slaveType || null, // Cultural variant (kajira, bondmaid, kajirus, thrall)
      statusSubtype: characterData.statusSubtype || null,

      // Caste/Role (optional, depends on culture)
      casteRole: characterData.casteRole || null,
      casteRoleType: characterData.casteRoleType || null,

      // Region
      region: characterData.region || null,
      homeStoneName: characterData.homeStoneName || null,

      // Base Stats
      strength: characterData.strength,
      agility: characterData.agility,
      intellect: characterData.intellect,
      perception: characterData.perception,
      charisma: characterData.charisma,
      statPointsPool: 10 - statPointsSpent,
      statPointsSpent: statPointsSpent,

      // Derived Stats
      healthMax: healthMax,

      // Skills
      skills: characterData.skills || [],
      skillsAllocatedPoints: characterData.skillsAllocatedPoints || 5,
      skillsSpentPoints: characterData.skillsSpentPoints || 0,

      // Abilities
      abilities: characterData.abilities || [],
      abilitiesAllocatedPoints: characterData.abilitiesAllocatedPoints || 7,
      abilitiesSpentPoints: characterData.abilitiesSpentPoints || 0,

      // Registration flag - Always true when web form successfully submits
      // (Web wizard validates all required fields before allowing submission)
      registrationCompleted: true
    };

    // Data for creating new character (current state only, no coins)
    const newCharacterData = {
      ...baseGoreanStatsData,
      healthCurrent: healthMax,  // Start at full health
      hungerCurrent: 100,
      thirstCurrent: 100,
      // goldCoin, silverCoin, copperCoin removed - now managed in UserStats only
      xp: 0
    };

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Check if user already has Gorean character and UserStats
      const existingGoreanStats = await tx.goreanStats.findUnique({
        where: { userId: user.id }
      });

      const existingUserStats = await tx.userStats.findUnique({
        where: { userId: user.id }
      });

      let goreanStats;

      if (existingGoreanStats) {
        // Update existing character (no coins to preserve in GoreanStats)
        goreanStats = await tx.goreanStats.update({
          where: { userId: user.id },
          data: {
            ...baseGoreanStatsData,
            // Preserve existing XP and state when updating character
            xp: existingGoreanStats.xp,
            // Update healthMax (from baseGoreanStatsData), but clamp current health if it exceeds new max
            healthCurrent: Math.min(existingGoreanStats.healthCurrent, healthMax)
          }
        });
      } else {
        // Create new character (no coins in GoreanStats)
        goreanStats = await tx.goreanStats.create({
          data: newCharacterData
        });
      }

      // Update or create UserStats (health/hunger/thirst from goreanStats, coins managed here)
      const userStats = await tx.userStats.upsert({
        where: { userId: user.id },
        update: {
          // Sync health/hunger/thirst from goreanStats
          health: goreanStats.healthCurrent,
          hunger: goreanStats.hungerCurrent,
          thirst: goreanStats.thirstCurrent,
          // For NEW character: set initial defaults. For EXISTING character: preserve coins.
          goldCoin: existingGoreanStats ? (existingUserStats?.goldCoin ?? 0) : 0,
          silverCoin: existingGoreanStats ? (existingUserStats?.silverCoin ?? 0) : 0,
          copperCoin: existingGoreanStats ? (existingUserStats?.copperCoin ?? 10) : 10,
          lastUpdated: new Date()
        },
        create: {
          userId: user.id,
          health: goreanStats.healthCurrent,
          hunger: goreanStats.hungerCurrent,
          thirst: goreanStats.thirstCurrent,
          status: 0,
          // Initial currency for new Gorean characters
          goldCoin: 0,
          silverCoin: 0,
          copperCoin: 10,
          lastUpdated: new Date()
        }
      });

      // Mark token as used by deleting it (one-time use)
      await tx.profileToken.delete({
        where: { id: profileToken.id }
      });

      // Update user's last active timestamp
      await tx.user.update({
        where: { id: user.id },
        data: { lastActive: new Date() }
      });

      return { goreanStats, userStats };
    });

    return NextResponse.json({
      success: true,
      data: {
        message: 'Gorean character created successfully',
        goreanStats: {
          id: result.goreanStats.id,
          characterName: result.goreanStats.characterName,
          agentName: result.goreanStats.agentName,
          species: result.goreanStats.species,
          speciesCategory: result.goreanStats.speciesCategory,
          culture: result.goreanStats.culture,
          status: result.goreanStats.status,
          casteRole: result.goreanStats.casteRole,
          strength: result.goreanStats.strength,
          agility: result.goreanStats.agility,
          intellect: result.goreanStats.intellect,
          perception: result.goreanStats.perception,
          charisma: result.goreanStats.charisma,
          healthMax: result.goreanStats.healthMax,
          healthCurrent: result.goreanStats.healthCurrent,
          goldCoin: result.userStats.goldCoin,
          silverCoin: result.userStats.silverCoin,
          copperCoin: result.userStats.copperCoin,
          xp: result.goreanStats.xp,
          skills: result.goreanStats.skills,
          abilities: result.goreanStats.abilities,
          registrationCompleted: result.goreanStats.registrationCompleted,
          createdAt: result.goreanStats.createdAt
        },
        user: {
          username: user.username,
          uuid: user.slUuid,
          universe: user.universe
        },
        // String boolean for LSL compatibility (follows Arkana pattern)
        hasGoreanCharacter: result.goreanStats.registrationCompleted ? "true" : "false"
      }
    });

  } catch (error: unknown) {
    console.error('Error creating Gorean character:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
