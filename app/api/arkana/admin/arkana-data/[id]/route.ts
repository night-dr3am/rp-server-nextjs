// Admin API for Single Arkana Data Item Operations
// GET: Get single item by ID
// PUT: Update item by ID
// DELETE: Delete item by ID

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  arkanaAdminDataGetSchema,
  arkanaAdminDataUpdateSchema,
  arkanaAdminDataDeleteSchema
} from '@/lib/validation';
import { validateAdminToken } from '@/lib/arkana/adminUtils';
import { invalidateCache, type ArkanaDataType } from '@/lib/arkana/unifiedDataLoader';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET: Get single item by ID
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    // 1. Validate input
    const { error, value } = arkanaAdminDataGetSchema.validate({
      token,
      id: params.id
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

    // 3. Get item from database
    const item = await prisma.arkanaData.findUnique({
      where: { id: value.id }
    });

    if (!item) {
      return NextResponse.json(
        { success: false, error: `Item with ID "${value.id}" not found` },
        { status: 404 }
      );
    }

    // 4. Return item with reconstructed structure
    return NextResponse.json({
      success: true,
      data: {
        id: item.id,
        arkanaDataType: item.arkanaDataType,
        orderNumber: item.orderNumber,
        ...(item.jsonData as Record<string, unknown>),
        _dbMeta: {
          orderNumber: item.orderNumber,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        }
      }
    });
  } catch (error: unknown) {
    console.error('Error getting arkana data item:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT: Update item by ID
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const body = await request.json();

    // 1. Validate input
    const { error, value } = arkanaAdminDataUpdateSchema.validate({
      ...body,
      id: params.id
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

    // 3. Check if item exists
    const existing = await prisma.arkanaData.findUnique({
      where: { id: value.id }
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Item with ID "${value.id}" not found` },
        { status: 404 }
      );
    }

    // 4. Update item (jsonData and orderNumber can be updated, not id or type)
    const updated = await prisma.arkanaData.update({
      where: { id: value.id },
      data: {
        jsonData: value.jsonData,
        ...(value.orderNumber !== undefined && { orderNumber: value.orderNumber })
      }
    });

    // 5. Invalidate cache for this type
    invalidateCache(updated.arkanaDataType as ArkanaDataType);

    return NextResponse.json({
      success: true,
      data: {
        message: 'Arkana data item updated successfully',
        item: {
          id: updated.id,
          arkanaDataType: updated.arkanaDataType,
          orderNumber: updated.orderNumber,
          ...(updated.jsonData as Record<string, unknown>),
          _dbMeta: {
            orderNumber: updated.orderNumber,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt
          }
        }
      }
    });
  } catch (error: unknown) {
    console.error('Error updating arkana data item:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Delete item by ID
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    // 1. Validate input
    const { error, value } = arkanaAdminDataDeleteSchema.validate({
      token,
      id: params.id
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

    // 3. Check if item exists
    const existing = await prisma.arkanaData.findUnique({
      where: { id: value.id }
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Item with ID "${value.id}" not found` },
        { status: 404 }
      );
    }

    // 4. Delete item
    await prisma.arkanaData.delete({
      where: { id: value.id }
    });

    // 5. Invalidate cache for this type
    invalidateCache(existing.arkanaDataType as ArkanaDataType);

    return NextResponse.json({
      success: true,
      data: {
        message: 'Arkana data item deleted successfully',
        deletedId: value.id,
        deletedType: existing.arkanaDataType
      }
    });
  } catch (error: unknown) {
    console.error('Error deleting arkana data item:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
