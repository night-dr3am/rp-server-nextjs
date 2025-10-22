import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { worldObjectUpsertSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const { error, value } = worldObjectUpsertSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid world object data', details: error.details },
        { status: 400 }
      );
    }

    const { objectId, universe, name, description, location, owner, type, state, stats, groups, actions, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Try to find existing world object or create new one
    const worldObject = await prisma.worldObject.upsert({
      where: {
        objectId_universe: {
          objectId,
          universe
        }
      },
      update: {
        name,
        description,
        location,
        owner,
        type,
        state,
        stats,
        groups,
        actions,
        updatedAt: new Date()
      },
      create: {
        objectId,
        universe,
        name,
        description,
        location,
        owner,
        type,
        state,
        stats,
        groups,
        actions
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        objectId: worldObject.objectId,
        universe: worldObject.universe,
        name: worldObject.name,
        description: worldObject.description,
        location: worldObject.location,
        owner: worldObject.owner,
        type: worldObject.type,
        state: worldObject.state,
        stats: worldObject.stats,
        groups: worldObject.groups,
        actions: worldObject.actions,
        createdAt: worldObject.createdAt,
        updatedAt: worldObject.updatedAt
      }
    });

  } catch (error) {
    console.error('World object upsert error:', error);

    let errorMessage = 'World object registration failed';
    let statusCode = 500;

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        errorMessage = 'World object with this ID already exists';
        statusCode = 409;
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: statusCode }
    );
  }
}
