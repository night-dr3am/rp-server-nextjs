// Admin API for Arkana Data Management
// GET: List/search arkana data items
// POST: Create new arkana data item

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  arkanaAdminDataListSchema,
  arkanaAdminDataCreateSchema
} from '@/lib/validation';
import { validateAdminToken } from '@/lib/arkana/adminUtils';
import { invalidateCache, loadArkanaData, type ArkanaDataType } from '@/lib/arkana/unifiedDataLoader';

// GET: List all items or filter by type
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const type = searchParams.get('type') || undefined;
    const search = searchParams.get('search') || '';
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '50';
    const sortBy = searchParams.get('sortBy') || 'id';
    const sortOrder = searchParams.get('sortOrder') || 'asc';

    // 1. Validate input
    const { error, value } = arkanaAdminDataListSchema.validate({
      token,
      type,
      search,
      page,
      limit,
      sortBy,
      sortOrder
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    // 2. Validate admin token
    const adminValidation = await validateAdminToken(value.token);
    if (!adminValidation.valid) {
      return NextResponse.json(
        { success: false, error: adminValidation.error || 'Access denied' },
        { status: 403 }
      );
    }

    // 3. Parse pagination parameters
    const pageNum = parseInt(value.page, 10);
    const limitNum = parseInt(value.limit, 10);
    const offset = (pageNum - 1) * limitNum;

    // 4. Load data using unified loader (database-first with JSON fallback)
    let allData: Array<Record<string, unknown>> = [];

    if (value.type) {
      // Load specific type
      const typeData = await loadArkanaData(value.type as ArkanaDataType);
      // Format items consistently (unified loader returns raw objects)
      allData = typeData.map(item => {
        const itemData = item as Record<string, unknown>;
        return {
          ...itemData,
          arkanaDataType: value.type,
          // Add unique composite key for React rendering (type:id)
          _uniqueId: `${value.type}:${itemData.id}`
        };
      });
    } else {
      // Load all types
      const types: ArkanaDataType[] = ['flaw', 'commonPower', 'archetypePower', 'perk',
                                        'magicSchool', 'magicWave', 'cybernetic', 'skill', 'effect'];

      for (const type of types) {
        const typeData = await loadArkanaData(type);
        allData.push(...typeData.map(item => {
          const itemData = item as Record<string, unknown>;
          return {
            ...itemData,
            arkanaDataType: type,
            // Add unique composite key for React rendering (type:id)
            _uniqueId: `${type}:${itemData.id}`
          };
        }));
      }
    }

    // 5. Apply search filter
    let filtered = allData;
    if (value.search) {
      const searchLower = value.search.toLowerCase();
      filtered = allData.filter(item => {
        const id = String(item.id || '').toLowerCase();
        const name = String(item.name || '').toLowerCase();
        return id.includes(searchLower) || name.includes(searchLower);
      });
    }

    // 6. Apply sorting
    const sortField = value.sortBy as 'id' | 'name' | 'cost' | 'type' | 'createdAt' | 'updatedAt';
    const sortDirection = value.sortOrder as 'asc' | 'desc';

    filtered.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      // Handle undefined values
      if (aVal === undefined && bVal === undefined) return 0;
      if (aVal === undefined) return sortDirection === 'asc' ? 1 : -1;
      if (bVal === undefined) return sortDirection === 'asc' ? -1 : 1;

      // String comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      // Number comparison
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      // Date comparison (if stored as ISO strings)
      if (typeof aVal === 'string' && typeof bVal === 'string' &&
          (sortField === 'createdAt' || sortField === 'updatedAt')) {
        const aTime = new Date(aVal).getTime();
        const bTime = new Date(bVal).getTime();
        return sortDirection === 'asc' ? aTime - bTime : bTime - aTime;
      }

      return 0;
    });

    // 7. Apply pagination
    const total = filtered.length;
    const paginatedItems = filtered.slice(offset, offset + limitNum);

    // 8. Return paginated response
    return NextResponse.json({
      success: true,
      data: {
        items: paginatedItems,
        total: total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        type: value.type || 'all'
      }
    });
  } catch (error: unknown) {
    console.error('Error listing arkana data:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Create new item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 1. Validate input
    const { error, value } = arkanaAdminDataCreateSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    // 2. Validate admin token
    const adminValidation = await validateAdminToken(value.token);
    if (!adminValidation.valid) {
      return NextResponse.json(
        { success: false, error: adminValidation.error || 'Access denied' },
        { status: 403 }
      );
    }

    // 3. Check if ID already exists (globally unique)
    const existing = await prisma.arkanaData.findUnique({
      where: { id: value.id }
    });

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: `ID "${value.id}" already exists with type "${existing.arkanaDataType}". IDs must be globally unique.`
        },
        { status: 409 }
      );
    }

    // 4. Create new item
    const newItem = await prisma.arkanaData.create({
      data: {
        id: value.id,
        arkanaDataType: value.type,
        jsonData: value.jsonData
      }
    });

    // 5. Invalidate cache for this type
    invalidateCache(value.type as ArkanaDataType);

    return NextResponse.json({
      success: true,
      data: {
        message: 'Arkana data item created successfully',
        item: {
          id: newItem.id,
          arkanaDataType: newItem.arkanaDataType,
          ...(newItem.jsonData as Record<string, unknown>),
          _dbMeta: {
            createdAt: newItem.createdAt,
            updatedAt: newItem.updatedAt
          }
        }
      }
    }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating arkana data:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
