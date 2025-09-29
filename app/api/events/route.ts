import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createEventSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import Joi from 'joi';

// Schema for getting events
const getEventsSchema = Joi.object({
  limit: Joi.string().optional(),
  offset: Joi.string().optional(),
  type: Joi.string().optional(),
  user_id: Joi.string().optional(),
  universe: Joi.string().required(),
  timestamp: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/).required(),
  signature: Joi.string().pattern(/^[a-f0-9]{64}$/).required()
});

// POST /api/events - Create a new event
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const { error, value } = createEventSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { sl_uuid, universe, type, details, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Validate that the user exists
    const user = await prisma.user.findFirst({
      where: {
        slUuid: sl_uuid,
        universe: universe
      }
    });
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Create the event
    const event = await prisma.event.create({
      data: {
        type,
        details,
        userId: user.id // Use the internal user ID, not the SL UUID
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        id: event.id,
        type: event.type,
        details: event.details,
        user_id: sl_uuid,
        timestamp: event.timestamp
      }
    }, { status: 201 });

  } catch (error: unknown) {
    console.error('Error creating event:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/events - Retrieve events
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    
    // Validate input
    const { error, value } = getEventsSchema.validate(params);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { limit: limitStr, offset: offsetStr, type, user_id, universe, timestamp, signature } = value;
    const limit = limitStr ? parseInt(limitStr) : 10;
    const offset = offsetStr ? parseInt(offsetStr) : 0;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Build query conditions
    const where: Record<string, unknown> = {};
    if (type) {
      where.type = type;
    }
    if (user_id) {
      // Find the user first to get internal ID
      const whereClause: { slUuid: string; universe?: string } = { slUuid: user_id };
      if (universe) {
        whereClause.universe = universe;
      }
      const user = await prisma.user.findFirst({
        where: whereClause
      });
      if (user) {
        where.userId = user.id;
      } else {
        return NextResponse.json(
          { success: false, error: 'User not found' },
          { status: 404 }
        );
      }
    }

    // Fetch events with pagination and include user data
    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        skip: offset,
        take: Math.min(limit, 100), // Cap at 100 events per request
        orderBy: { timestamp: 'desc' },
        include: { user: true }
      }),
      prisma.event.count({ where })
    ]);

    return NextResponse.json({
      success: true,
      data: {
        events: events.map((event) => ({
          id: event.id,
          type: event.type,
          details: event.details,
          user_id: event.user.slUuid,
          username: event.user.username,
          timestamp: event.timestamp
        })),
        pagination: {
          total,
          limit,
          offset,
          has_more: offset + limit < total
        }
      }
    });

  } catch (error: unknown) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
