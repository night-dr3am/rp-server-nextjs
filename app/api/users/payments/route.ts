import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateSignature } from '@/lib/signature';
import Joi from 'joi';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sl_uuid = searchParams.get('sl_uuid');
    const universe = searchParams.get('universe');
    const timestamp = searchParams.get('timestamp');
    const signature = searchParams.get('signature');
    const limit = parseInt(searchParams.get('limit') || '10');

    // Validate required parameters
    if (!sl_uuid || !universe || !timestamp || !signature) {
      return NextResponse.json(
        { error: 'Missing required parameters: sl_uuid, universe, timestamp, or signature' },
        { status: 400 }
      );
    }

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find user
    const user = await prisma.user.findFirst({
      where: { slUuid: sl_uuid, universe }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get payment history (both sent and received)
    const paymentEvents = await prisma.event.findMany({
      where: {
        userId: user.id,
        type: {
          in: ['PAYMENT_SENT', 'PAYMENT_RECEIVED']
        }
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: limit,
      include: {
        user: {
          select: {
            username: true,
            slUuid: true
          }
        }
      }
    });

    // Format the response
    const formattedEvents = paymentEvents.map((event: {
      id: string;
      type: string;
      timestamp: Date;
      details: unknown;
      user: { username: string; slUuid: string };
    }) => ({
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      details: event.details,
      user: event.user
    }));

    return NextResponse.json({
      success: true,
      data: {
        user: {
          sl_uuid: user.slUuid,
          username: user.username
        },
        payments: formattedEvents,
        total: formattedEvents.length
      }
    });

  } catch (error) {
    console.error('Payment history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment history' },
      { status: 500 }
    );
  }
}

// Validation schema for POST method
const paymentsPostSchema = Joi.object({
  sl_uuid: Joi.string().uuid().required(),
  universe: Joi.string().min(1).max(50).required(),
  limit: Joi.number().integer().min(1).max(100).optional().default(10),
  timestamp: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/).required(),
  signature: Joi.string().pattern(/^[a-f0-9]{64}$/).required()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const { error, value } = paymentsPostSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.details },
        { status: 400 }
      );
    }

    const { sl_uuid, universe, limit, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find user
    const user = await prisma.user.findFirst({
      where: { slUuid: sl_uuid, universe }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get payment history (both sent and received)
    const paymentEvents = await prisma.event.findMany({
      where: {
        userId: user.id,
        type: {
          in: ['PAYMENT_SENT', 'PAYMENT_RECEIVED']
        }
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: limit,
      include: {
        user: {
          select: {
            username: true,
            slUuid: true
          }
        }
      }
    });

    // Format the response
    const formattedEvents = paymentEvents.map((event: {
      id: string;
      type: string;
      timestamp: Date;
      details: unknown;
      user: { username: string; slUuid: string };
    }) => ({
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      details: event.details,
      user: event.user
    }));

    return NextResponse.json({
      success: true,
      data: {
        user: {
          sl_uuid: user.slUuid,
          username: user.username
        },
        payments: formattedEvents,
        total: formattedEvents.length
      }
    });

  } catch (error) {
    console.error('Payment history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment history' },
      { status: 500 }
    );
  }
}
