import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { estateRentSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const { error, value } = estateRentSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid rental data', details: error.details },
        { status: 400 }
      );
    }

    const { estateId, renterUuid, universe, days, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Start a database transaction for atomic rental processing
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Find the estate using composite key with universe
      const estate = await tx.estate.findFirst({
        where: {
          estateId,
          universe
        },
        include: {
          rentingUser: true
        }
      });

      if (!estate) {
        throw new Error('Estate not found');
      }

      // Check if estate is already rented and not expired
      const now = new Date();
      if (estate.rentEndDate && now < estate.rentEndDate) {
        // Check if it's the same user extending the rental
        if (!estate.rentingUser || estate.rentingUser.slUuid !== renterUuid || estate.rentingUser.universe !== universe) {
          throw new Error('Estate is already rented by another user');
        }
      }

      // Find the renter
      const renter = await tx.user.findFirst({
        where: { slUuid: renterUuid, universe },
        include: { stats: true }
      });

      if (!renter) {
        throw new Error('Renter not found');
      }

      if (!renter.stats) {
        throw new Error('Renter stats not found');
      }

      // Calculate total cost
      const totalCost = estate.rentPricePerDay * days;

      // Check if renter has sufficient funds (in copper coins)
      if (renter.stats.copperCoin < totalCost) {
        throw new Error('Insufficient funds. Need ' + totalCost + ' copper coins');
      }

      // Calculate rental dates
      let rentStartDate: Date;
      let rentEndDate: Date;
      let isExtension = false;

      if (estate.rentEndDate && now < estate.rentEndDate && estate.rentingUser?.slUuid === renterUuid && estate.rentingUser?.universe === universe) {
        // Extending existing rental
        rentStartDate = estate.rentStartDate!;
        rentEndDate = new Date(estate.rentEndDate.getTime() + (days * 24 * 60 * 60 * 1000));
        isExtension = true;
      } else {
        // New rental
        rentStartDate = now;
        rentEndDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));
      }

      // Deduct payment from renter
      await tx.userStats.update({
        where: { userId: renter.id },
        data: {
          copperCoin: renter.stats.copperCoin - totalCost,
          lastUpdated: now
        }
      });

      // Update estate with rental information
      const updatedEstate = await tx.estate.update({
        where: {
          estateId_universe: {
            estateId,
            universe
          }
        },
        data: {
          rentingUserId: renter.id,
          rentStartDate,
          rentEndDate,
          totalPaidAmount: isExtension ? estate.totalPaidAmount + totalCost : totalCost,
          updatedAt: now
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

      // Log the rental event
      await tx.event.create({
        data: {
          type: isExtension ? 'ESTATE_RENTAL_EXTENDED' : 'ESTATE_RENTAL_STARTED',
          userId: renter.id,
          details: {
            estateId,
            estateName: estate.name,
            days,
            totalCost,
            rentStartDate: rentStartDate.toISOString(),
            rentEndDate: rentEndDate.toISOString(),
            pricePerDay: estate.rentPricePerDay,
            isExtension
          }
        }
      });

      return {
        estate: updatedEstate,
        renter,
        totalCost,
        isExtension,
        daysAdded: days
      };
    });

    // Calculate days remaining
    const timeRemaining = result.estate.rentEndDate!.getTime() - new Date().getTime();
    const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));

    return NextResponse.json({
      success: true,
      data: {
        estateId: result.estate.estateId,
        estateName: result.estate.name,
        renterUuid: result.renter.slUuid,
        renterName: result.renter.username,
        rentStartDate: result.estate.rentStartDate,
        rentEndDate: result.estate.rentEndDate,
        daysRemaining,
        daysAdded: result.daysAdded,
        totalCost: result.totalCost,
        totalPaidAmount: result.estate.totalPaidAmount,
        isExtension: result.isExtension,
        pricePerDay: result.estate.rentPricePerDay
      }
    });

  } catch (error) {
    console.error('Estate rental error:', error);
    
    let errorMessage = 'Estate rental failed';
    let statusCode = 500;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      if (error.message.includes('not found')) {
        statusCode = 404;
      } else if (error.message.includes('already rented') || 
                 error.message.includes('Insufficient funds')) {
        statusCode = 400;
      }
    }
    
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: statusCode }
    );
  }
}