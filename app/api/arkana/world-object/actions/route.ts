import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { worldObjectActionsSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const { error, value } = worldObjectActionsSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data', details: error.details },
        { status: 400 }
      );
    }

    const { objectId, playerUuid, universe, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch world object
    const worldObject = await prisma.worldObject.findUnique({
      where: {
        objectId_universe: {
          objectId,
          universe
        }
      }
    });

    if (!worldObject) {
      return NextResponse.json(
        { success: false, error: 'World object not found' },
        { status: 404 }
      );
    }

    // Verify player exists (optional - for future permission checking)
    const player = await prisma.user.findFirst({
      where: {
        slUuid: playerUuid,
        universe: 'arkana'
      },
      include: {
        arkanaStats: true
      }
    });

    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found in Arkana universe' },
        { status: 404 }
      );
    }

    // Get current state of the world object
    const currentState = worldObject.state;

    // Get all actions from the world object
    const allActions = (worldObject.actions as Array<{
      id: string;
      label: string;
      showState: string;
      targetState?: string;
      description?: string;
      requiresStat?: Record<string, number>;
      requiredGroup?: string;
      requiredRole?: string;
    }>) || [];

    // Filter actions based on current state
    // CRITICAL: Only return actions where showState matches current object state
    const availableActions: Array<{
      id: string;
      label: string;
      description?: string;
    }> = [];

    for (const action of allActions) {
      // Check if this action's showState matches the current state
      if (action.showState === currentState) {
        // This action is available - add it to the response
        availableActions.push({
          id: action.id,
          label: action.label,
          description: action.description
        });
      }
      // If showState doesn't match, skip this action (do not include in response)
    }

    return NextResponse.json({
      success: true,
      data: {
        objectId: worldObject.objectId,
        objectName: worldObject.name,
        currentState: currentState,
        actions: availableActions
      }
    });

  } catch (error) {
    console.error('World object actions error:', error);

    return NextResponse.json(
      { success: false, error: 'Failed to retrieve world object actions' },
      { status: 500 }
    );
  }
}
