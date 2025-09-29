import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { estateInfoSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

export async function GET(request: NextRequest, { params }: { params: Promise<{ estateId: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const universe = searchParams.get('universe') || 'Gor';
    const timestamp = searchParams.get('timestamp');
    const signature = searchParams.get('signature');

    // Validate required parameters
    if (!timestamp || !signature) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: timestamp and signature' },
        { status: 400 }
      );
    }

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const { estateId } = await params;

    // Validate estateId and universe
    const { error } = estateInfoSchema.validate({
      estateId,
      universe,
      timestamp,
      signature
    });
    if (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid estate ID', details: error.details },
        { status: 400 }
      );
    }

    // Find the estate
    const estate = await prisma.estate.findUnique({
      where: {
        estateId_universe: {
          estateId,
          universe
        }
      },
      include: {
        rentingUser: {
          select: {
            slUuid: true,
            username: true
          }
        },
        tenants: {
          select: {
            slUuid: true,
            username: true
          }
        }
      }
    });

    if (!estate) {
      return NextResponse.json(
        { success: false, error: 'Estate not found' },
        { status: 404 }
      );
    }

    // Calculate rental status
    let isRented = false;
    let daysRemaining = 0;
    let renterUuid = null;
    let renterName = null;
    let isExpired = false;

    if (estate.rentEndDate && estate.rentStartDate) {
      const now = new Date();
      if (now < estate.rentEndDate) {
        isRented = true;
        const timeRemaining = estate.rentEndDate.getTime() - now.getTime();
        daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));
        
        if (estate.rentingUser) {
          renterUuid = estate.rentingUser.slUuid;
          renterName = estate.rentingUser.username;
        }
      } else if (estate.rentingUser) {
        // Rental has expired
        isExpired = true;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        estateId: estate.estateId,
        universe: estate.universe,
        name: estate.name,
        description: estate.description,
        rentPricePerDay: estate.rentPricePerDay,
        location: estate.location,
        isRented,
        isExpired,
        daysRemaining,
        renterUuid,
        renterName,
        tenants: estate.tenants,
        totalPaidAmount: estate.totalPaidAmount,
        rentStartDate: estate.rentStartDate,
        rentEndDate: estate.rentEndDate,
        createdAt: estate.createdAt,
        updatedAt: estate.updatedAt
      }
    });

  } catch (error) {
    console.error('Estate info error:', error);
    
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve estate information' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ estateId: string }> }) {
  try {
    const body = await request.json();
    const { estateId } = await params;

    // Validate request body
    const { error, value } = estateInfoSchema.validate({
      estateId,
      universe: body.universe || 'Gor',
      timestamp: body.timestamp,
      signature: body.signature
    });
    if (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid estate request', details: error.details },
        { status: 400 }
      );
    }

    const { universe, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find the estate (same logic as GET)
    const estate = await prisma.estate.findUnique({
      where: {
        estateId_universe: {
          estateId,
          universe
        }
      },
      include: {
        rentingUser: {
          select: {
            slUuid: true,
            username: true
          }
        },
        tenants: {
          select: {
            slUuid: true,
            username: true
          }
        }
      }
    });

    if (!estate) {
      return NextResponse.json(
        { success: false, error: 'Estate not found' },
        { status: 404 }
      );
    }

    // Calculate rental status (same logic as GET)
    let isRented = false;
    let daysRemaining = 0;
    let renterUuid = null;
    let renterName = null;
    let isExpired = false;

    if (estate.rentEndDate && estate.rentStartDate) {
      const now = new Date();
      if (now < estate.rentEndDate) {
        isRented = true;
        const timeRemaining = estate.rentEndDate.getTime() - now.getTime();
        daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));

        if (estate.rentingUser) {
          renterUuid = estate.rentingUser.slUuid;
          renterName = estate.rentingUser.username;
        }
      } else if (estate.rentingUser) {
        isExpired = true;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        estateId: estate.estateId,
        universe: estate.universe,
        name: estate.name,
        description: estate.description,
        rentPricePerDay: estate.rentPricePerDay,
        location: estate.location,
        isRented,
        isExpired,
        daysRemaining,
        renterUuid,
        renterName,
        tenants: estate.tenants,
        totalPaidAmount: estate.totalPaidAmount,
        rentStartDate: estate.rentStartDate,
        rentEndDate: estate.rentEndDate,
        createdAt: estate.createdAt,
        updatedAt: estate.updatedAt
      }
    });

  } catch (error) {
    console.error('Estate info error:', error);

    return NextResponse.json(
      { success: false, error: 'Failed to retrieve estate information' },
      { status: 500 }
    );
  }
}