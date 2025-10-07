import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaCharacterCreateSchema } from '@/lib/validation';
import { validateProfileToken } from '@/lib/profileTokenUtils';
import { getAllFlaws, loadAllData } from '@/lib/arkana/dataLoader';

export async function POST(request: NextRequest) {
  try {
    // Load Arkana data if not already loaded
    await loadAllData();

    const body = await request.json();

    // Validate input
    const { error, value } = arkanaCharacterCreateSchema.validate(body);
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

    // Verify token is for Arkana universe
    if (user.universe !== universe || universe !== 'arkana') {
      return NextResponse.json(
        { success: false, error: 'Token is not valid for Arkana universe' },
        { status: 401 }
      );
    }

    // Calculate derived stats
    const hitPoints = characterData.physical * 5;
    const statPointsSpent = (characterData.physical - 1) + (characterData.dexterity - 1) +
                           (characterData.mental - 1) + (characterData.perception - 1);

    // Calculate flaw points from flaw IDs
    const allFlaws = getAllFlaws();
    const flawPointsGranted = characterData.flaws?.reduce((sum: number, flawId: string) => {
      const flaw = allFlaws.find(f => f.id === flawId);
      return sum + (flaw ? flaw.cost : 0);
    }, 0) || 0;

    // Calculate power points (simplified for now)
    const powerPointsBudget = 15;
    const powerPointsBonus = flawPointsGranted;
    const powerPointsSpent = 0; // Will be calculated based on selected powers in full implementation

    // Check if this is a complete character (has required fields)
    const isCompleteCharacter = !!(
      characterData.characterName &&
      characterData.agentName &&
      characterData.race &&
      characterData.archetype &&
      characterData.physical >= 1 &&
      characterData.dexterity >= 1 &&
      characterData.mental >= 1 &&
      characterData.perception >= 1
    );

    // Convert flaws array to JSON format expected by schema
    const flawsJson = characterData.flaws?.map((flawId: string) => {
      const flaw = allFlaws.find(f => f.id === flawId);
      return flaw ? { id: flaw.id, name: flaw.name, cost: flaw.cost } : null;
    }).filter(Boolean) || null;

    // Convert cybernetics array to JSON format expected by schema
    const cyberneticsJson = characterData.cybernetics?.length > 0 ?
      characterData.cybernetics.map((cybId: string) => ({ id: cybId })) : null;

    // Merge picks into perks array (since schema doesn't have picks field)
    const allPerks = [
      ...(characterData.perks || []),
      ...(characterData.picks || [])
    ];

    // Note: cyberSlots, freeMagicSchool, freeMagicWeave, synthralFreeWeave are used for
    // character creation logic but not stored in DB. They're handled in the frontend.

    // Base arkana stats data for both create and update
    const baseArkanaStatsData = {
      userId: user.id,
      characterName: characterData.characterName,
      agentName: characterData.agentName,
      aliasCallsign: characterData.aliasCallsign || null,
      faction: characterData.faction || null,
      conceptRole: characterData.conceptRole || null,
      job: characterData.job || null,
      background: characterData.background || null,
      race: characterData.race,
      subrace: characterData.subrace || null,
      archetype: characterData.archetype || null,
      physical: characterData.physical,
      dexterity: characterData.dexterity,
      mental: characterData.mental,
      perception: characterData.perception,
      hitPoints: hitPoints,
      statPointsPool: 10 - statPointsSpent,
      statPointsSpent: statPointsSpent,
      inherentPowers: characterData.inherentPowers || [],
      weaknesses: characterData.weaknesses || [],
      flaws: flawsJson,
      flawPointsGranted: flawPointsGranted,
      powerPointsBudget: powerPointsBudget,
      powerPointsBonus: powerPointsBonus,
      powerPointsSpent: powerPointsSpent,
      commonPowers: characterData.commonPowers || [],
      archetypePowers: characterData.archetypePowers || [],
      perks: allPerks,
      magicSchools: characterData.magicSchools || [],
      magicWeaves: characterData.magicWeaves || [],
      cybernetics: cyberneticsJson,
      cyberneticAugments: characterData.cyberneticAugments || [],
      registrationCompleted: isCompleteCharacter
    };

    // Data for creating new character (includes initial currency)
    const newCharacterData = {
      ...baseArkanaStatsData,
      credits: 5, // Initial credits for new Arkana characters
      chips: 5    // Initial chips for new Arkana characters
    };

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Check if user already has Arkana character
      const existingArkanaStats = await tx.arkanaStats.findUnique({
        where: { userId: user.id }
      });

      let arkanaStats;

      if (existingArkanaStats) {
        // Update existing character (preserve existing currency)
        arkanaStats = await tx.arkanaStats.update({
          where: { userId: user.id },
          data: baseArkanaStatsData
        });
      } else {
        // Create new character (include initial currency)
        arkanaStats = await tx.arkanaStats.create({
          data: newCharacterData
        });
      }

      // Update or create UserStats to set health to match hitPoints (character starts at full health)
      await tx.userStats.upsert({
        where: { userId: user.id },
        update: {
          health: hitPoints,
          lastUpdated: new Date()
        },
        create: {
          userId: user.id,
          health: hitPoints,
          hunger: 100,
          thirst: 100,
          status: 0,
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

      return arkanaStats;
    });

    return NextResponse.json({
      success: true,
      data: {
        message: 'Arkana character created successfully',
        arkanaStats: {
          id: result.id,
          characterName: result.characterName,
          race: result.race,
          archetype: result.archetype,
          physical: result.physical,
          dexterity: result.dexterity,
          mental: result.mental,
          perception: result.perception,
          hitPoints: result.hitPoints,
          credits: result.credits,
          chips: result.chips,
          xp: result.xp,
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
    console.error('Error creating Arkana character:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}