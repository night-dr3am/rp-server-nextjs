import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { goreanCheckUserSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const { error, value } = goreanCheckUserSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { sl_uuid, universe, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user exists in Gor universe (case-insensitive universe matching)
    const user = await prisma.user.findFirst({
      where: {
        slUuid: sl_uuid,
        universe: {
          equals: universe,
          mode: 'insensitive'
        }
      },
      include: {
        goreanStats: true
      }
    });

    if (!user) {
      return NextResponse.json({
        success: true,
        data: {
          exists: false,
          message: 'User not found in Gor universe'
        }
      });
    }

    // Check if character creation is completed
    const hasCompletedCharacter = !!(user.goreanStats && user.goreanStats.registrationCompleted);

    // Update last active timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() }
    });

    return NextResponse.json({
      success: true,
      data: {
        exists: true,
        characterCompleted: hasCompletedCharacter,
        user: {
          username: user.username,
          uuid: user.slUuid,
          universe: user.universe,
          role: user.role
        },
        goreanStats: hasCompletedCharacter ? {
          characterName: user.goreanStats!.characterName,
          agentName: user.goreanStats!.agentName,
          species: user.goreanStats!.species,
          culture: user.goreanStats!.culture,
          socialStatus: user.goreanStats!.socialStatus,
          registrationCompleted: user.goreanStats!.registrationCompleted
        } : null
      }
    });

  } catch (error: unknown) {
    console.error('Error checking Gor user:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
