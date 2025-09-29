/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { craftingCompleteSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { error, value } = craftingCompleteSchema.validate(body);
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

    const { sl_uuid, universe, stationId } = value;

    const result = await prisma.$transaction(async (tx) => {
      // Find user
      const user = await (tx as any).user.findUnique({
        where: {
          slUuid_universe: {
            slUuid: sl_uuid,
            universe
          }
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Find crafting station
      const station = await (tx as any).craftingStation.findUnique({
        where: {
          stationId_universe: {
            stationId,
            universe
          }
        }
      });

      if (!station) {
        throw new Error('Crafting station not found');
      }

      // Find pending crafting for this user and station
      const crafting = await (tx as any).crafting.findFirst({
        where: {
          userId: user.id,
          craftingStationId: station.id,
          collected: false
        },
        include: {
          recipe: true
        }
      });

      if (!crafting) {
        // No active crafting - just reset station if it's busy
        if (station.busy) {
          await (tx as any).craftingStation.update({
            where: { id: station.id },
            data: { busy: false }
          });
          return { message: 'Station reset, no active crafting found' };
        }
        return { message: 'No active crafting found' };
      }

      // Check if crafting time has passed
      const now = new Date();
      const craftingEndTime = new Date(crafting.startTime.getTime() + (crafting.recipe.craftingTime * 1000));

      if (now < craftingEndTime) {
        const remainingTime = Math.ceil((craftingEndTime.getTime() - now.getTime()) / 1000);
        throw new Error(`Crafting not complete yet. ${remainingTime} seconds remaining`);
      }

      // Find or create the output item in user's inventory
      const outputItem = await (tx as any).rpItem.findUnique({
        where: {
          shortName_universe: {
            shortName: crafting.recipe.outputItemShortName,
            universe
          }
        }
      });

      if (!outputItem) {
        throw new Error(`Output item '${crafting.recipe.outputItemShortName}' not found`);
      }

      // Add output item to user's inventory
      const existingInventory = await (tx as any).userInventory.findUnique({
        where: {
          userId_rpItemId: {
            userId: user.id,
            rpItemId: outputItem.id
          }
        }
      });

      if (existingInventory) {
        await (tx as any).userInventory.update({
          where: {
            id: existingInventory.id
          },
          data: {
            quantity: existingInventory.quantity + crafting.recipe.outputItemQuantity
          }
        });
      } else {
        await (tx as any).userInventory.create({
          data: {
            userId: user.id,
            rpItemId: outputItem.id,
            quantity: crafting.recipe.outputItemQuantity,
            useCount: outputItem.useCount,
            priceGold: outputItem.priceGold,
            priceSilver: outputItem.priceSilver,
            priceCopper: outputItem.priceCopper
          }
        });
      }

      // Award experience points if any
      if (crafting.recipe.exp > 0) {
        // Add experience to user stats if there's an exp system
        // For now, we'll log it in events
        await (tx as any).event.create({
          data: {
            type: 'CRAFTING_EXP',
            details: {
              recipeShortName: crafting.recipe.shortName,
              expAwarded: crafting.recipe.exp,
              source: 'crafting'
            },
            userId: user.id
          }
        });
      }

      // Mark crafting as collected
      await (tx as any).crafting.update({
        where: { id: crafting.id },
        data: { collected: true }
      });

      // Reset station busy status
      await (tx as any).craftingStation.update({
        where: { id: station.id },
        data: { busy: false }
      });

      // Log crafting completion event
      await (tx as any).event.create({
        data: {
          type: 'CRAFTING_COMPLETE',
          details: {
            recipeShortName: crafting.recipe.shortName,
            recipeName: crafting.recipe.name,
            outputItemShortName: crafting.recipe.outputItemShortName,
            outputQuantity: crafting.recipe.outputItemQuantity,
            craftingTime: crafting.recipe.craftingTime,
            stationId,
            stationType: station.type
          },
          userId: user.id
        }
      });

      return {
        message: 'Crafting completed successfully',
        outputItem: crafting.recipe.outputItemShortName,
        outputQuantity: crafting.recipe.outputItemQuantity,
        expAwarded: crafting.recipe.exp
      };
    });

    return NextResponse.json({ success: true, data: result });

  } catch (err) {
    console.error('Crafting complete error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: err instanceof Error && err.message.includes('not found') ? 404 : 500 }
    );
  }
}