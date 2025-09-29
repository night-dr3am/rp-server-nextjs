/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { craftingStartSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { error, value } = craftingStartSchema.validate(body);
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

    const { sl_uuid, universe, stationId, recipeShortName } = value;

    await prisma.$transaction(async (tx) => {
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

      if (station.busy) {
        throw new Error('Crafting station is currently busy');
      }

      // Find recipe
      const recipe = await (tx as any).recipe.findUnique({
        where: {
          shortName_universe: {
            shortName: recipeShortName,
            universe
          }
        }
      });

      if (!recipe) {
        throw new Error('Recipe not found');
      }

      // Verify station type matches recipe
      if (recipe.craftingStationType !== station.type) {
        throw new Error(`Recipe requires ${recipe.craftingStationType} station, but this is a ${station.type} station`);
      }

      // Check if user has access to this recipe
      const hasBasicAccess = (!recipe.knowledge || recipe.knowledge === '') &&
                           (!recipe.tool || recipe.tool === '') &&
                           (!recipe.license || recipe.license === '');
      const hasKnowledgeAccess = user.knownRecipes.includes(recipe.shortName);

      if (!hasBasicAccess && !hasKnowledgeAccess) {
        throw new Error('You do not have the required knowledge, tools, or license for this recipe');
      }

      // Get user's inventory
      const userInventory = await (tx as any).userInventory.findMany({
        where: {
          userId: user.id
        },
        include: {
          item: true
        }
      });

      // Check if user has all required ingredients
      const ingredients = recipe.ingredients as Array<{quantity: number, rpItemShortName: string}>;
      for (const ingredient of ingredients) {
        const inventoryItem = userInventory.find(
          (inv: any) => inv.item.shortName === ingredient.rpItemShortName
        );

        if (!inventoryItem || inventoryItem.quantity < ingredient.quantity) {
          throw new Error(`Insufficient ${ingredient.rpItemShortName}. Required: ${ingredient.quantity}, Available: ${inventoryItem?.quantity || 0}`);
        }
      }

      // Deduct ingredients from inventory
      for (const ingredient of ingredients) {
        const inventoryItem = userInventory.find(
          (inv: any) => inv.item.shortName === ingredient.rpItemShortName
        );

        await (tx as any).userInventory.update({
          where: {
            id: inventoryItem.id
          },
          data: {
            quantity: inventoryItem.quantity - ingredient.quantity
          }
        });
      }

      // Create crafting record
      const crafting = await (tx as any).crafting.create({
        data: {
          universe,
          userId: user.id,
          craftingStationId: station.id,
          recipeShortName,
          startTime: new Date(),
          collected: false
        }
      });

      // Mark station as busy
      await (tx as any).craftingStation.update({
        where: {
          id: station.id
        },
        data: {
          busy: true
        }
      });

      return { crafting, recipe };
    });

    return NextResponse.json({
      success: true,
      data: {
        message: 'Crafting started successfully',
        craftingTime: (await (prisma as any).recipe.findUnique({
          where: { shortName_universe: { shortName: recipeShortName, universe } }
        }))?.craftingTime
      }
    });

  } catch (err) {
    console.error('Crafting start error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: err instanceof Error && err.message.includes('not found') ? 404 : 500 }
    );
  }
}