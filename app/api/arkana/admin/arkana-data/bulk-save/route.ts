// Admin API for Bulk Saving Arkana Data
// POST: Save multiple items to database (useful for JSON → DB migration)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaAdminDataBulkSaveSchema } from '@/lib/validation';
import { validateAdminToken } from '@/lib/arkana/adminUtils';
import { invalidateCache } from '@/lib/arkana/unifiedDataLoader';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 1. Validate input
    const { error, value } = arkanaAdminDataBulkSaveSchema.validate(body);
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

    // 3. Validate ID uniqueness in the request
    const ids = value.data.map((item: { id: string; type: string; jsonData: Record<string, unknown> }) => item.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      const duplicates = ids.filter((id: string, index: number) => ids.indexOf(id) !== index);
      return NextResponse.json(
        {
          success: false,
          error: `Duplicate IDs found in request: ${duplicates.join(', ')}`
        },
        { status: 400 }
      );
    }

    // 4. Perform bulk save in transaction
    const result = await prisma.$transaction(async (tx) => {
      const created: string[] = [];
      const updated: string[] = [];
      const errors: Array<{ id: string; error: string }> = [];

      for (const item of value.data) {
        try {
          // Check if item exists
          const existing = await tx.arkanaData.findUnique({
            where: { id: item.id }
          });

          if (existing) {
            // Update existing item
            await tx.arkanaData.update({
              where: { id: item.id },
              data: {
                type: item.type, // Allow type change in bulk operations
                jsonData: item.jsonData
              }
            });
            updated.push(item.id);
          } else {
            // Create new item
            await tx.arkanaData.create({
              data: {
                id: item.id,
                type: item.type,
                jsonData: item.jsonData
              }
            });
            created.push(item.id);
          }
        } catch (itemError: unknown) {
          errors.push({
            id: item.id,
            error: itemError instanceof Error ? itemError.message : 'Unknown error'
          });
        }
      }

      return { created, updated, errors };
    });

    // 5. Invalidate all caches (since we may have updated multiple types)
    invalidateCache();

    // 6. Determine success status
    const hasErrors = result.errors.length > 0;
    const allFailed = result.errors.length === value.data.length;

    if (allFailed) {
      return NextResponse.json(
        {
          success: false,
          error: 'All items failed to save',
          data: result
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: !hasErrors,
      data: {
        message: hasErrors
          ? 'Bulk save completed with some errors'
          : 'Bulk save completed successfully',
        created: result.created.length,
        updated: result.updated.length,
        failed: result.errors.length,
        total: value.data.length,
        errors: result.errors.length > 0 ? result.errors : undefined
      }
    }, { status: hasErrors ? 207 : 200 }); // 207 = Multi-Status
  } catch (error: unknown) {
    console.error('Error in bulk save:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
