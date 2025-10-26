import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { worldObjectSyncSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const { error, value } = worldObjectSyncSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid sync request', details: error.details },
        { status: 400 }
      );
    }

    const { objectId, universe, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch current state from database
    const worldObject = await prisma.worldObject.findUnique({
      where: {
        objectId_universe: {
          objectId,
          universe
        }
      },
      select: {
        objectId: true,
        state: true,
        name: true
      }
    });

    if (!worldObject) {
      return NextResponse.json(
        { success: false, error: 'World object not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        objectId: worldObject.objectId,
        state: worldObject.state,
        name: worldObject.name
      }
    });

  } catch (error) {
    console.error('World object sync error:', error);
    return NextResponse.json(
      { success: false, error: 'Sync request failed' },
      { status: 500 }
    );
  }
}
