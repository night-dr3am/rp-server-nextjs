/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { craftingStationUpsertSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { error, value } = craftingStationUpsertSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    // Validate signature
    const signatureValidation = validateSignature(value.timestamp, value.signature, value.universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const { stationId, universe, name, type } = value;

    const station = await (prisma as any).craftingStation.upsert({
      where: {
        stationId_universe: {
          stationId,
          universe
        }
      },
      update: {
        name,
        type
      },
      create: {
        stationId,
        universe,
        name,
        type,
        busy: false
      }
    });

    return NextResponse.json({ success: true, data: station });
  } catch (err) {
    console.error('Crafting station upsert error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}