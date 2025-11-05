import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaAdminUserSearchSchema } from '@/lib/validation';
import { validateAdminToken } from '@/lib/arkana/adminUtils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Validate input
    const { error, value } = arkanaAdminUserSearchSchema.validate({ token, search, page, limit });
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

    // Build search query for Arkana universe users
    const whereClause: Record<string, unknown> = {
      universe: 'arkana',
      arkanaStats: {
        isNot: null // Only users with Arkana characters
      }
    };

    // Add search filter if provided
    if (value.search && value.search.trim() !== '') {
      const searchTerm = value.search.trim();
      whereClause.OR = [
        {
          slUuid: {
            contains: searchTerm,
            mode: 'insensitive'
          }
        },
        {
          username: {
            contains: searchTerm,
            mode: 'insensitive'
          }
        },
        {
          arkanaStats: {
            characterName: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          }
        },
        {
          arkanaStats: {
            agentName: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          }
        }
      ];
    }

    // Calculate pagination
    const skip = (value.page - 1) * value.limit;

    // Fetch users with their Arkana stats and current health
    const [users, totalUsers] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
        include: {
          arkanaStats: {
            select: {
              characterName: true,
              agentName: true,
              race: true,
              archetype: true,
              maxHP: true,
              physical: true,
              dexterity: true,
              mental: true,
              perception: true,
              credits: true,
              chips: true,
              xp: true,
              arkanaRole: true,
              registrationCompleted: true,
              createdAt: true,
              updatedAt: true
            }
          },
          stats: {
            select: {
              health: true,
              status: true
            }
          }
        },
        orderBy: {
          lastActive: 'desc'
        },
        skip: skip,
        take: value.limit
      }),
      prisma.user.count({
        where: whereClause
      })
    ]);

    const totalPages = Math.ceil(totalUsers / value.limit);

    // Format response
    return NextResponse.json({
      success: true,
      data: {
        users: users.map(user => ({
          id: user.id,
          slUuid: user.slUuid,
          username: user.username,
          role: user.role,
          characterName: user.arkanaStats?.characterName || 'Unknown',
          agentName: user.arkanaStats?.agentName || 'Unknown',
          race: user.arkanaStats?.race || 'Unknown',
          archetype: user.arkanaStats?.archetype || 'Unknown',
          currentHealth: user.stats?.health || 0,
          maxHealth: user.arkanaStats?.maxHP || 100,
          status: user.stats?.status || 0,
          physical: user.arkanaStats?.physical || 1,
          dexterity: user.arkanaStats?.dexterity || 1,
          mental: user.arkanaStats?.mental || 1,
          perception: user.arkanaStats?.perception || 1,
          credits: user.arkanaStats?.credits || 0,
          chips: user.arkanaStats?.chips || 0,
          xp: user.arkanaStats?.xp || 0,
          arkanaRole: user.arkanaStats?.arkanaRole || 'player',
          registrationCompleted: user.arkanaStats?.registrationCompleted || false,
          createdAt: user.createdAt,
          lastActive: user.lastActive
        })),
        pagination: {
          currentPage: value.page,
          totalPages: totalPages,
          totalUsers: totalUsers,
          hasNextPage: value.page < totalPages,
          hasPrevPage: value.page > 1
        }
      }
    });

  } catch (error: unknown) {
    console.error('Error searching Arkana users:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
