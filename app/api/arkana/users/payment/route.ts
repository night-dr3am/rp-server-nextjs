import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaPaymentSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const { error, value } = arkanaPaymentSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { sender_uuid, recipient_uuid, universe, currency, amount, timestamp, signature } = value;

    // Check if sender and recipient are the same
    if (sender_uuid === recipient_uuid) {
      return NextResponse.json(
        { success: false, error: 'Sender and recipient cannot be the same' },
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

    // Start a database transaction for atomic payment processing
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Find sender with arkana stats
      const sender = await tx.user.findFirst({
        where: { slUuid: sender_uuid, universe },
        include: {
          stats: true,
          arkanaStats: true
        }
      });

      if (!sender) {
        throw new Error('Sender not found in Arkana universe');
      }

      if (!sender.arkanaStats) {
        throw new Error('Sender has no Arkana character');
      }

      // Find recipient with arkana stats
      const recipient = await tx.user.findFirst({
        where: { slUuid: recipient_uuid, universe },
        include: {
          stats: true,
          arkanaStats: true
        }
      });

      if (!recipient) {
        throw new Error('Recipient not found in Arkana universe');
      }

      if (!recipient.arkanaStats) {
        throw new Error('Recipient has no Arkana character');
      }

      // Check sender has sufficient funds
      const senderBalance = currency === 'credits' ? sender.arkanaStats.credits : sender.arkanaStats.chips;
      if (senderBalance < amount) {
        throw new Error(`Insufficient ${currency}. You have ${senderBalance} ${currency}, but tried to send ${amount}.`);
      }

      // Prepare update data
      const senderUpdateData: { credits?: number; chips?: number } = {};
      const recipientUpdateData: { credits?: number; chips?: number } = {};

      if (currency === 'credits') {
        senderUpdateData.credits = sender.arkanaStats.credits - amount;
        recipientUpdateData.credits = recipient.arkanaStats.credits + amount;
      } else {
        senderUpdateData.chips = sender.arkanaStats.chips - amount;
        recipientUpdateData.chips = recipient.arkanaStats.chips + amount;
      }

      // Update sender's balance
      const updatedSender = await tx.arkanaStats.update({
        where: { userId: sender.id },
        data: senderUpdateData
      });

      // Update recipient's balance
      const updatedRecipient = await tx.arkanaStats.update({
        where: { userId: recipient.id },
        data: recipientUpdateData
      });

      // Log the transaction for both users
      await tx.event.create({
        data: {
          userId: sender.id,
          type: 'PAYMENT_SENT',
          details: {
            recipient: recipient_uuid,
            recipientName: recipient.arkanaStats.characterName,
            currency,
            amount,
            newBalance: currency === 'credits' ? updatedSender.credits : updatedSender.chips
          }
        }
      });

      await tx.event.create({
        data: {
          userId: recipient.id,
          type: 'PAYMENT_RECEIVED',
          details: {
            sender: sender_uuid,
            senderName: sender.arkanaStats.characterName,
            currency,
            amount,
            newBalance: currency === 'credits' ? updatedRecipient.credits : updatedRecipient.chips
          }
        }
      });

      return { updatedSender, updatedRecipient };
    });

    // Return success response
    return NextResponse.json({
      success: true,
      data: {
        message: `Successfully sent ${amount} ${currency} to recipient`,
        transaction: {
          sender_uuid,
          recipient_uuid,
          currency,
          amount,
          sender_new_balance: currency === 'credits' ? result.updatedSender.credits : result.updatedSender.chips,
          recipient_new_balance: currency === 'credits' ? result.updatedRecipient.credits : result.updatedRecipient.chips
        }
      }
    }, { status: 200 });

  } catch (error: unknown) {
    console.error('Error processing Arkana payment:', error);

    // Handle specific error messages
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';

    // Determine status code based on error type
    let statusCode = 500;
    if (errorMessage.includes('not found')) {
      statusCode = 404;
    } else if (errorMessage.includes('Insufficient') || errorMessage.includes('has no Arkana character')) {
      statusCode = 400;
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: statusCode }
    );
  }
}