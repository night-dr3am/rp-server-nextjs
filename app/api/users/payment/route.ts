import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paymentSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const { error, value } = paymentSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { error: 'Invalid payment data', details: error.details },
        { status: 400 }
      );
    }

    const { sender_uuid, recipient_uuid, universe, goldCoin, silverCoin, copperCoin, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Start a database transaction for atomic payment processing
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Check if sender exists and has sufficient funds
      const sender = await tx.user.findFirst({
        where: { slUuid: sender_uuid, universe },
        include: { stats: true }
      });

      if (!sender) {
        throw new Error('Sender not found');
      }

      if (!sender.stats) {
        throw new Error('Sender stats not found');
      }

      // Check if recipient exists
      const recipient = await tx.user.findFirst({
        where: { slUuid: recipient_uuid, universe },
        include: { stats: true }
      });

      if (!recipient) {
        throw new Error('Recipient not found');
      }

      if (!recipient.stats) {
        throw new Error('Recipient stats not found');
      }

      // Validate sender has sufficient funds
      if (sender.stats.goldCoin < goldCoin || 
          sender.stats.silverCoin < silverCoin || 
          sender.stats.copperCoin < copperCoin) {
        throw new Error('Insufficient funds');
      }

      // Validate payment amount is positive
      if (goldCoin < 0 || silverCoin < 0 || copperCoin < 0) {
        throw new Error('Invalid payment amount');
      }

      // Validate at least one coin is being transferred
      if (goldCoin === 0 && silverCoin === 0 && copperCoin === 0) {
        throw new Error('Payment amount must be greater than zero');
      }

      // Update sender's coins (subtract)
      const updatedSender = await tx.userStats.update({
        where: { userId: sender.id },
        data: {
          goldCoin: sender.stats.goldCoin - goldCoin,
          silverCoin: sender.stats.silverCoin - silverCoin,
          copperCoin: sender.stats.copperCoin - copperCoin,
          lastUpdated: new Date(),
        }
      });

      // Update recipient's coins (add)
      const updatedRecipient = await tx.userStats.update({
        where: { userId: recipient.id },
        data: {
          goldCoin: recipient.stats.goldCoin + goldCoin,
          silverCoin: recipient.stats.silverCoin + silverCoin,
          copperCoin: recipient.stats.copperCoin + copperCoin,
          lastUpdated: new Date(),
        }
      });

      // Log the transaction for both users
      // Event for sender
      await tx.event.create({
        data: {
          type: 'PAYMENT_SENT',
          userId: sender.id,
          details: {
            action: 'sent',
            recipient_uuid,
            recipient_name: recipient.username,
            amount: {
              gold: goldCoin,
              silver: silverCoin,
              copper: copperCoin
            },
            balance_after: {
              gold: updatedSender.goldCoin,
              silver: updatedSender.silverCoin,
              copper: updatedSender.copperCoin
            }
          }
        }
      });

      // Event for recipient
      await tx.event.create({
        data: {
          type: 'PAYMENT_RECEIVED',
          userId: recipient.id,
          details: {
            action: 'received',
            sender_uuid,
            sender_name: sender.username,
            amount: {
              gold: goldCoin,
              silver: silverCoin,
              copper: copperCoin
            },
            balance_after: {
              gold: updatedRecipient.goldCoin,
              silver: updatedRecipient.silverCoin,
              copper: updatedRecipient.copperCoin
            }
          }
        }
      });

      return {
        sender: { ...sender, stats: updatedSender },
        recipient: { ...recipient, stats: updatedRecipient }
      };
    });

    // Format response
    const amount = `${goldCoin}g ${silverCoin}s ${copperCoin}c`;
    
    return NextResponse.json({
      success: true,
      message: 'Payment processed successfully',
      senderName: result.sender.username,
      recipientName: result.recipient.username,
      amount: amount,
      sender: {
        sl_uuid: result.sender.slUuid,
        username: result.sender.username,
        stats: result.sender.stats
      },
      recipient: {
        sl_uuid: result.recipient.slUuid,
        username: result.recipient.username,
        stats: result.recipient.stats
      }
    });

  } catch (error) {
    console.error('Payment processing error:', error);
    
    let errorMessage = 'Payment processing failed';
    let statusCode = 500;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      if (error.message.includes('not found')) {
        statusCode = 404;
      } else if (error.message.includes('Insufficient funds') || 
                 error.message.includes('Invalid payment amount') ||
                 error.message.includes('greater than zero')) {
        statusCode = 400;
      }
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}
