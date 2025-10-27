import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { goreanStatsSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

// GET /api/gor/stats - Retrieve Gorean character statistics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sl_uuid = searchParams.get('sl_uuid');
    const universe = searchParams.get('universe');
    const timestamp = searchParams.get('timestamp');
    const signature = searchParams.get('signature');

    // Validate input using our validation schema
    const { error } = goreanStatsSchema.validate({ sl_uuid, universe, timestamp, signature });
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    // Validate signature
    const signatureValidation = validateSignature(timestamp!, signature!, universe!);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find user and their Gorean stats
    const user = await prisma.user.findFirst({
      where: {
        slUuid: sl_uuid!,
        universe: universe!
      },
      include: { goreanStats: true }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    if (!user.goreanStats) {
      return NextResponse.json(
        { success: false, error: 'Gorean character not created' },
        { status: 404 }
      );
    }

    // Update last active timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() }
    });

    // Return Gorean stats data
    return NextResponse.json({
      success: true,
      data: {
        // Identity
        characterName: user.goreanStats.characterName,
        agentName: user.goreanStats.agentName,
        title: user.goreanStats.title,

        // Species & Culture
        species: user.goreanStats.species,
        speciesCategory: user.goreanStats.speciesCategory,
        culture: user.goreanStats.culture,
        cultureType: user.goreanStats.cultureType,
        status: user.goreanStats.status,
        casteRole: user.goreanStats.casteRole,
        region: user.goreanStats.region,
        homeStoneName: user.goreanStats.homeStoneName,

        // Base Stats
        strength: user.goreanStats.strength,
        agility: user.goreanStats.agility,
        intellect: user.goreanStats.intellect,
        perception: user.goreanStats.perception,
        charisma: user.goreanStats.charisma,

        // Current State
        healthCurrent: user.goreanStats.healthCurrent,
        healthMax: user.goreanStats.healthMax,
        hungerCurrent: user.goreanStats.hungerCurrent,
        thirstCurrent: user.goreanStats.thirstCurrent,

        // Economy
        goldCoin: user.goreanStats.goldCoin,
        silverCoin: user.goreanStats.silverCoin,
        copperCoin: user.goreanStats.copperCoin,
        xp: user.goreanStats.xp,

        // Skills
        skills: user.goreanStats.skills,

        // Active Effects
        activeEffects: user.goreanStats.activeEffects,
        liveStats: user.goreanStats.liveStats,

        // Metadata
        registrationCompleted: user.goreanStats.registrationCompleted,
        gorRole: user.goreanStats.gorRole,
        updatedAt: user.goreanStats.updatedAt,

        // User info
        username: user.username,
        userRole: user.role
      }
    });

  } catch (error: unknown) {
    console.error('Error getting Gorean stats:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
