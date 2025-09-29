/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rpItemUpsertSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { error, value } = rpItemUpsertSchema.validate(body);
    if (error) return NextResponse.json({ success: false, error: error.details[0].message }, { status: 400 });

    // Validate signature
    const signatureValidation = validateSignature(value.timestamp, value.signature, value.universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

  const { name, shortName, universe, isShortNameDifferent, category, tags = "", hungerValue, thirstValue, healthValue, edible, drinkable, useCount = 0, priceGold, priceSilver, priceCopper } = value;

  const item = await (prisma as any).rpItem.upsert({
      where: {
        shortName_universe: {
          shortName,
          universe
        }
      },
      update: { name, isShortNameDifferent, category, tags, hungerValue, thirstValue, healthValue, edible, drinkable, useCount, priceGold, priceSilver, priceCopper },
      create: { name, shortName, universe, isShortNameDifferent, category, tags, hungerValue, thirstValue, healthValue, edible, drinkable, useCount, priceGold, priceSilver, priceCopper }
    });

    return NextResponse.json({ success: true, data: item });
  } catch (err) {
    console.error('rpitems upsert error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const tags = searchParams.get('tags');
    const shortName = searchParams.get('shortName');
    const universe = searchParams.get('universe') || 'Gor';  // Default to Gor for backward compatibility
    const timestamp = searchParams.get('timestamp');
    const signature = searchParams.get('signature');
    const randomParam = searchParams.get('random');
    const countParam = searchParams.get('count');

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

    // Handle shortName-specific query (for RPITEM_INFO)
    if (shortName) {
      const item = await (prisma as any).rpItem.findUnique({
        where: {
          shortName_universe: {
            shortName,
            universe
          }
        }
      });
      
      if (!item) {
        return NextResponse.json({ success: false, error: 'Item not found' }, { status: 404 });
      }
      
      return NextResponse.json({ success: true, data: [item] });
    }

    // Validate parameters for general queries
    const random = randomParam === '1' ? true : false;
    let count: number | undefined;
    
    if (countParam) {
      count = parseInt(countParam);
      if (isNaN(count) || count <= 0) {
        return NextResponse.json({ success: false, error: 'count must be a positive number' }, { status: 400 });
      }
    }

    const where: any = {};
    if (category) where.category = category;
    
    if (tags) {
      // Split #-separated tags and create case-insensitive search
      const tagList = tags.split('#').map(tag => tag.trim());
      where.OR = tagList.map(tag => ({
        tags: {
          contains: tag,
          mode: 'insensitive'
        }
      }));
    }

    // Build query options
    const queryOptions: any = { where };
    
    // Add ordering - random or alphabetical
    if (count && random) {
      // For random selection, we'll fetch all matching items first, then randomize
      const allItems = await (prisma as any).rpItem.findMany({ 
        where, 
        orderBy: { shortName: 'asc' } 
      });
      
      // Shuffle the array using Fisher-Yates algorithm
      for (let i = allItems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allItems[i], allItems[j]] = [allItems[j], allItems[i]];
      }
      
      // Return the requested count
      const items = allItems.slice(0, count);
      return NextResponse.json({ success: true, data: items });
    } else {
      // Regular query with optional count limit
      queryOptions.orderBy = { shortName: 'asc' };
      if (count) {
        queryOptions.take = count;
      }
      
      const items = await (prisma as any).rpItem.findMany(queryOptions);
      return NextResponse.json({ success: true, data: items });
    }
  } catch (err) {
    console.error('rpitems list error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
