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

    // Verify token is for Gor universe
    if (user.universe !== universe || universe !== 'gor') {
      return NextResponse.json(
        { success: false, error: 'Token is not valid for Gor universe' },
        { status: 401 }
      );
    }

    // Load species and culture data for HP calculation
    const species = getSpeciesById(characterData.species);
    if (!species) {
      return NextResponse.json(
        { success: false, error: `Invalid species: ${characterData.species}` },
        { status: 400 }
      );
    }

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

    // Check if this is a complete character (has all required fields)
    const isCompleteCharacter = !!(
      characterData.characterName &&
      characterData.agentName &&
      characterData.species &&
      characterData.speciesCategory &&
      characterData.culture &&
      characterData.cultureType &&
      characterData.status &&
      characterData.strength >= 1 &&
      characterData.agility >= 1 &&
      characterData.intellect >= 1 &&
      characterData.perception >= 1 &&
      characterData.charisma >= 1
    );

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

      // Registration flag
      registrationCompleted: isCompleteCharacter
    };

    // Data for creating new character (includes initial currency and current state)
    const newCharacterData = {
      ...baseGoreanStatsData,
      healthCurrent: healthMax,  // Start at full health
      hungerCurrent: 100,
      thirstCurrent: 100,
      goldCoin: 0,
      silverCoin: 5,   // Initial currency for new Gorean characters
      copperCoin: 50,
      xp: 0
    };

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Check if user already has Gorean character
      const existingGoreanStats = await tx.goreanStats.findUnique({
        where: { userId: user.id }
      });

      let goreanStats;

      if (existingGoreanStats) {
        // Update existing character (preserve existing currency and state)
        goreanStats = await tx.goreanStats.update({
          where: { userId: user.id },
          data: {
            ...baseGoreanStatsData,
            // Preserve existing currency and state when updating character
            goldCoin: existingGoreanStats.goldCoin,
            silverCoin: existingGoreanStats.silverCoin,
            copperCoin: existingGoreanStats.copperCoin,
            xp: existingGoreanStats.xp,
            // Update healthMax (from baseGoreanStatsData), but clamp current health if it exceeds new max
            healthCurrent: Math.min(existingGoreanStats.healthCurrent, healthMax)
          }
        });
      } else {
        // Create new character (include initial currency and state)
        goreanStats = await tx.goreanStats.create({
          data: newCharacterData
        });
      }

      // Update or create UserStats to sync with Gorean character health
      await tx.userStats.upsert({
        where: { userId: user.id },
        update: {
          health: goreanStats.healthCurrent,
          hunger: goreanStats.hungerCurrent,
          thirst: goreanStats.thirstCurrent,
          goldCoin: goreanStats.goldCoin,
          silverCoin: goreanStats.silverCoin,
          copperCoin: goreanStats.copperCoin,
          lastUpdated: new Date()
        },
        create: {
          userId: user.id,
          health: goreanStats.healthCurrent,
          hunger: goreanStats.hungerCurrent,
          thirst: goreanStats.thirstCurrent,
          status: 0,
          goldCoin: goreanStats.goldCoin,
          silverCoin: goreanStats.silverCoin,
          copperCoin: goreanStats.copperCoin,
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

      return goreanStats;
    });

    return NextResponse.json({
      success: true,
      data: {
        message: 'Gorean character created successfully',
        goreanStats: {
          id: result.id,
          characterName: result.characterName,
          agentName: result.agentName,
          species: result.species,
          speciesCategory: result.speciesCategory,
          culture: result.culture,
          status: result.status,
          casteRole: result.casteRole,
          strength: result.strength,
          agility: result.agility,
          intellect: result.intellect,
          perception: result.perception,
          charisma: result.charisma,
          healthMax: result.healthMax,
          healthCurrent: result.healthCurrent,
          goldCoin: result.goldCoin,
          silverCoin: result.silverCoin,
          copperCoin: result.copperCoin,
          xp: result.xp,
          skills: result.skills,
          registrationCompleted: result.registrationCompleted,
          createdAt: result.createdAt
        },
        user: {
          username: user.username,
          uuid: user.slUuid,
          universe: user.universe
        }
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
