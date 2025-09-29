import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currencyExchangeSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { Prisma } from '@prisma/client';

// Currency exchange rates (1 silver = 100 copper, 1 gold = 100 silver)
const COPPER_PER_SILVER = 100;
const SILVER_PER_GOLD = 100;
const COPPER_PER_GOLD = COPPER_PER_SILVER * SILVER_PER_GOLD;

// Parse currency string format: XgXsXc where X is zero or positive number
function parseCurrencyString(currencyStr: string): { gold: number; silver: number; copper: number } | null {
  const cleaned = currencyStr.toLowerCase().trim();
  
  // Match pattern like "1g", "5s", "100c", "1g5s", "5s100c", "1g5s100c"
  const pattern = /^(?:(\d+)g)?(?:(\d+)s)?(?:(\d+)c)?$/;
  const match = cleaned.match(pattern);
  
  if (!match) return null;
  
  const gold = parseInt(match[1] || '0');
  const silver = parseInt(match[2] || '0');
  const copper = parseInt(match[3] || '0');
  
  // At least one currency must be specified
  if (gold === 0 && silver === 0 && copper === 0) return null;
  
  return { gold, silver, copper };
}

// Convert currency to total copper value for exchange rate validation only
function currencyToCopper(gold: number, silver: number, copper: number): number {
  return (gold * COPPER_PER_GOLD) + (silver * COPPER_PER_SILVER) + copper;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const { error, value } = currencyExchangeSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { sl_uuid, universe, pay_amount, receive_amount, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse currency strings
    const payParsed = parseCurrencyString(pay_amount);
    const receiveParsed = parseCurrencyString(receive_amount);

    if (!payParsed || !receiveParsed) {
      return NextResponse.json(
        { error: 'Invalid currency format. Use format like "1g", "5s", "100c", "1g5s100c"' },
        { status: 400 }
      );
    }

    // Validate that this is a valid exchange using copper value comparison for exchange rate validation
    const payTotalCopper = currencyToCopper(payParsed.gold, payParsed.silver, payParsed.copper);
    const receiveTotalCopper = currencyToCopper(receiveParsed.gold, receiveParsed.silver, receiveParsed.copper);

    // Validate that this is a valid exchange (not generating money)
    if (receiveTotalCopper >= payTotalCopper) {
      return NextResponse.json(
        { error: 'Invalid exchange: receive amount must be less than pay amount' },
        { status: 400 }
      );
    }

    // Check if user exists first (outside transaction)
    const userCheck = await prisma.user.findFirst({
      where: { slUuid: sl_uuid, universe },
      include: { stats: true }
    });

    if (!userCheck) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 400 }
      );
    }

    if (!userCheck.stats) {
      return NextResponse.json(
        { success: false, error: 'User stats not found' },
        { status: 400 }
      );
    }

    // Validate user has exact coins they want to pay (physical coin validation)
    if (userCheck.stats.goldCoin < payParsed.gold) {
      return NextResponse.json(
        { success: false, error: `Insufficient gold coins: need ${payParsed.gold}, have ${userCheck.stats.goldCoin}` },
        { status: 400 }
      );
    }
    if (userCheck.stats.silverCoin < payParsed.silver) {
      return NextResponse.json(
        { success: false, error: `Insufficient silver coins: need ${payParsed.silver}, have ${userCheck.stats.silverCoin}` },
        { status: 400 }
      );
    }
    if (userCheck.stats.copperCoin < payParsed.copper) {
      return NextResponse.json(
        { success: false, error: `Insufficient copper coins: need ${payParsed.copper}, have ${userCheck.stats.copperCoin}` },
        { status: 400 }
      );
    }

    // Start a database transaction for atomic currency exchange
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Re-fetch user within transaction to ensure consistency
      const user = await tx.user.findFirst({
        where: { slUuid: sl_uuid, universe },
        include: { stats: true }
      });

      if (!user || !user.stats) {
        throw new Error('User not found in transaction');
      }

      // Calculate new balance by directly adding/subtracting physical coins
      const newGold = user.stats.goldCoin - payParsed.gold + receiveParsed.gold;
      const newSilver = user.stats.silverCoin - payParsed.silver + receiveParsed.silver;
      const newCopper = user.stats.copperCoin - payParsed.copper + receiveParsed.copper;

      // Update user's currency with exact coin counts
      const updatedStats = await tx.userStats.update({
        where: { userId: user.id },
        data: {
          goldCoin: newGold,
          silverCoin: newSilver,
          copperCoin: newCopper,
          lastUpdated: new Date(),
        }
      });

      // Create exchange event
      await tx.event.create({
        data: {
          type: 'CURRENCY_EXCHANGE',
          userId: user.id,
          details: {
            action: 'currency_exchange',
            pay_amount: pay_amount,
            receive_amount: receive_amount,
            paid: {
              gold: payParsed.gold,
              silver: payParsed.silver,
              copper: payParsed.copper
            },
            received: {
              gold: receiveParsed.gold,
              silver: receiveParsed.silver,
              copper: receiveParsed.copper
            },
            exchange_fee: payTotalCopper - receiveTotalCopper,
            balance_before: {
              gold: user.stats.goldCoin,
              silver: user.stats.silverCoin,
              copper: user.stats.copperCoin
            },
            balance_after: {
              gold: updatedStats.goldCoin,
              silver: updatedStats.silverCoin,
              copper: updatedStats.copperCoin
            }
          }
        }
      });

      return {
        user: { ...user, stats: updatedStats },
        exchangeFee: payTotalCopper - receiveTotalCopper
      };
    });

    // Format response
    return NextResponse.json({
      success: true,
      message: 'Currency exchange completed successfully',
      username: result.user.username,
      pay_amount: pay_amount,
      receive_amount: receive_amount,
      exchange_fee_copper: result.exchangeFee,
      balance: {
        gold: result.user.stats.goldCoin,
        silver: result.user.stats.silverCoin,
        copper: result.user.stats.copperCoin
      }
    });

  } catch (error) {
    console.error('Currency exchange error:', error);
    
    let errorMessage = 'Currency exchange failed';
    let statusCode = 500;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      if (error.message.includes('not found')) {
        statusCode = 404;
      } else if (error.message.includes('Insufficient funds') || 
                 error.message.includes('Invalid exchange') ||
                 error.message.includes('Invalid currency format')) {
        statusCode = 400;
      }
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}
