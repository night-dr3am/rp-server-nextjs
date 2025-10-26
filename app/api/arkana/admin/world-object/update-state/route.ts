import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaAdminObjectUpdateStateSchema } from '@/lib/validation';
import { validateAdminToken } from '@/lib/arkana/adminUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const { error, value } = arkanaAdminObjectUpdateStateSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    // Validate admin token
    const adminValidation = await validateAdminToken(value.token);
    if (!adminValidation.valid) {
      return NextResponse.json(
        { success: false, error: adminValidation.error || 'Access denied' },
        { status: 403 }
      );
    }

    // Find the object
    const worldObject = await prisma.worldObject.findUnique({
      where: {
        objectId_universe: {
          objectId: value.objectId,
          universe: 'arkana'
        }
      }
    });

    if (!worldObject) {
      return NextResponse.json(
        { success: false, error: 'World object not found' },
        { status: 404 }
      );
    }

    // Update the state
    const updatedObject = await prisma.worldObject.update({
      where: {
        objectId_universe: {
          objectId: value.objectId,
          universe: 'arkana'
        }
      },
      data: {
        state: value.state,
        updatedAt: new Date()
      },
      select: {
        objectId: true,
        name: true,
        state: true,
        type: true,
        updatedAt: true
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        objectId: updatedObject.objectId,
        name: updatedObject.name,
        state: updatedObject.state,
        type: updatedObject.type,
        updatedAt: updatedObject.updatedAt
      }
    });

  } catch (error: unknown) {
    console.error('Error updating world object state:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
