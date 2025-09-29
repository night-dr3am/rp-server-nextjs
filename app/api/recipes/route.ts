/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recipeUpsertSchema, recipesListSchema, craftingCategoriesSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

// POST - Create/Update recipe (for recipesUpdater.lsl)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { error, value } = recipeUpsertSchema.validate(body);
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

    const {
      name, shortName, universe, craftingStationType, ingredients, craftingTime,
      outputItemShortName, outputItemQuantity, knowledge, tool, license,
      category, tags, exp
    } = value;

    // Verify output item exists
    const outputItem = await (prisma as any).rpItem.findUnique({
      where: {
        shortName_universe: {
          shortName: outputItemShortName,
          universe
        }
      }
    });

    if (!outputItem) {
      return NextResponse.json(
        { success: false, error: `Output item '${outputItemShortName}' not found in universe '${universe}'` },
        { status: 400 }
      );
    }

    // Verify all ingredient items exist
    for (const ingredient of ingredients) {
      const ingredientItem = await (prisma as any).rpItem.findUnique({
        where: {
          shortName_universe: {
            shortName: ingredient.rpItemShortName,
            universe
          }
        }
      });

      if (!ingredientItem) {
        return NextResponse.json(
          { success: false, error: `Ingredient item '${ingredient.rpItemShortName}' not found in universe '${universe}'` },
          { status: 400 }
        );
      }
    }

    const recipe = await (prisma as any).recipe.upsert({
      where: {
        shortName_universe: {
          shortName,
          universe
        }
      },
      update: {
        name, craftingStationType, ingredients, craftingTime,
        outputItemShortName, outputItemQuantity, knowledge, tool, license,
        category, tags, exp
      },
      create: {
        name, shortName, universe, craftingStationType, ingredients, craftingTime,
        outputItemShortName, outputItemQuantity, knowledge, tool, license,
        category, tags, exp
      }
    });

    return NextResponse.json({ success: true, data: recipe });
  } catch (err) {
    console.error('Recipe upsert error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Get recipes by station type and category, filtered by user knowledge
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const craftingStationType = searchParams.get('craftingStationType');
    const category = searchParams.get('category');
    const sl_uuid = searchParams.get('sl_uuid');
    const universe = searchParams.get('universe') || 'Gor';
    const shortNamesOnly = searchParams.get('shortNamesOnly') === 'true';
    const timestamp = searchParams.get('timestamp');
    const signature = searchParams.get('signature');

    // Handle crafting categories request
    if (craftingStationType && !category && !sl_uuid) {
      if (!timestamp || !signature) {
        return NextResponse.json(
          { success: false, error: 'Missing required parameters: timestamp and signature' },
          { status: 400 }
        );
      }

      const { error: catError } = craftingCategoriesSchema.validate({
        craftingStationType,
        universe,
        timestamp,
        signature
      });

      if (catError) {
        return NextResponse.json(
          { success: false, error: catError.details[0].message },
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

      // Return hardcoded categories for now as requested
      const categories = ['Food', 'Drinks', 'Bondmaid Food'];
      return NextResponse.json({ success: true, data: categories });
    }

    // Handle recipes list request
    if (!craftingStationType || !category || !sl_uuid || !timestamp || !signature) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const { error } = recipesListSchema.validate({
      craftingStationType,
      category,
      sl_uuid,
      universe,
      shortNamesOnly,
      timestamp,
      signature
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
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

    // Find user to get their known recipes
    const user = await (prisma as any).user.findUnique({
      where: {
        slUuid_universe: {
          slUuid: sl_uuid,
          universe
        }
      },
      select: {
        knownRecipes: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Get recipes that match criteria and require no special knowledge/tool/license
    // OR are in the user's known recipes
    const recipes = await (prisma as any).recipe.findMany({
      where: {
        universe,
        craftingStationType,
        category,
        OR: [
          {
            // Basic recipes - no requirements
            AND: [
              { OR: [{ knowledge: null }, { knowledge: '' }] },
              { OR: [{ tool: null }, { tool: '' }] },
              { OR: [{ license: null }, { license: '' }] }
            ]
          },
          {
            // Known recipes
            shortName: {
              in: user.knownRecipes
            }
          }
        ]
      },
      select: shortNamesOnly ? {
        shortName: true
      } : {
        shortName: true,
        name: true,
        ingredients: true,
        craftingTime: true,
        outputItemShortName: true,
        outputItemQuantity: true,
        category: true,
        tags: true,
        exp: true
      }
    });

    // If shortNamesOnly is true, return array of shortName strings
    if (shortNamesOnly) {
      const shortNames = recipes.map((recipe: any) => recipe.shortName);
      return NextResponse.json({ success: true, data: shortNames });
    }

    return NextResponse.json({ success: true, data: recipes });
  } catch (err) {
    console.error('Recipes list error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}