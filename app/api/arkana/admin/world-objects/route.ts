import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaAdminObjectSearchSchema } from '@/lib/validation';
import { validateAdminToken } from '@/lib/arkana/adminUtils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Validate input
    const { error, value } = arkanaAdminObjectSearchSchema.validate({ token, search, page, limit });
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    // Validate admin token
    const adminValidation = await validateAdminToken(value.token);
    if (!adminValidation.valid) {
      return NextResponse.json(
        { success: false, error: adminValidation.error || 'Access denied' },
        { status: 403 }
      );
    }

    // Build search query for Arkana universe objects
    const whereClause: Record<string, unknown> = {
      universe: 'arkana'
    };

    // Add search filter if provided
    if (value.search && value.search.trim() !== '') {
      const searchTerm = value.search.trim();
      whereClause.OR = [
        {
          objectId: {
            contains: searchTerm,
            mode: 'insensitive'
          }
        },
        {
          name: {
            contains: searchTerm,
            mode: 'insensitive'
          }
        }
      ];
    }

    // Calculate pagination
    const skip = (value.page - 1) * value.limit;

    // Fetch world objects
    const [objects, totalObjects] = await Promise.all([
      prisma.worldObject.findMany({
        where: whereClause,
        select: {
          id: true,
          objectId: true,
          name: true,
          type: true,
          state: true,
          description: true,
          location: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: {
          updatedAt: 'desc'
        },
        skip: skip,
        take: value.limit
      }),
      prisma.worldObject.count({
        where: whereClause
      })
    ]);

    const totalPages = Math.ceil(totalObjects / value.limit);

    // Format response
    return NextResponse.json({
      success: true,
      data: {
        objects: objects,
        pagination: {
          currentPage: value.page,
          totalPages: totalPages,
          totalObjects: totalObjects,
          hasNextPage: value.page < totalPages,
          hasPrevPage: value.page > 1
        }
      }
    });

  } catch (error: unknown) {
    console.error('Error searching world objects:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
