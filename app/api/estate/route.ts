import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { estateRegistrationSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { Prisma } from '@prisma/client';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const { error, value } = estateRegistrationSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid estate data', details: error.details },
        { status: 400 }
      );
    }

    const { estateId, universe, name, description, rentPricePerDay, location, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Try to find existing estate or create new one
    const estate = await prisma.estate.upsert({
      where: {
        estateId_universe: {
          estateId,
          universe
        }
      },
      update: {
        name,
        description,
        rentPricePerDay,
        location,
        updatedAt: new Date()
      },
      create: {
        estateId,
        universe,
        name,
        description,
        rentPricePerDay,
        location
      },
      include: {
        rentingUser: {
          select: {
            slUuid: true,
            username: true
          }
        }
      }
    });

    // Calculate rental status
    let isRented = false;
    let daysRemaining = 0;
    let renterUuid = null;
    let renterName = null;

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
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        estateId: estate.estateId,
        name: estate.name,
        description: estate.description,
        rentPricePerDay: estate.rentPricePerDay,
        location: estate.location,
        isRented,
        daysRemaining,
        renterUuid,
        renterName,
        totalPaidAmount: estate.totalPaidAmount,
        createdAt: estate.createdAt,
        updatedAt: estate.updatedAt
      }
    });

  } catch (error) {
    console.error('Estate registration error:', error);
    
    let errorMessage = 'Estate registration failed';
    let statusCode = 500;
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        errorMessage = 'Estate with this ID already exists';
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

export async function GET(request: NextRequest) {
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

    const estates = await prisma.estate.findMany({
      include: {
        rentingUser: {
          select: {
            slUuid: true,
            username: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    // Add computed rental status to each estate
    const estatesWithStatus = estates.map(estate => {
      let isRented = false;
      let daysRemaining = 0;
      let renterUuid = null;
      let renterName = null;

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
        }
      }

      return {
        estateId: estate.estateId,
        name: estate.name,
        description: estate.description,
        rentPricePerDay: estate.rentPricePerDay,
        location: estate.location,
        isRented,
        daysRemaining,
        renterUuid,
        renterName,
        totalPaidAmount: estate.totalPaidAmount,
        createdAt: estate.createdAt,
        updatedAt: estate.updatedAt
      };
    });

    return NextResponse.json({
      success: true,
      data: estatesWithStatus
    });

  } catch (error) {
    console.error('Estate listing error:', error);
    
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve estates' },
      { status: 500 }
    );
  }
}