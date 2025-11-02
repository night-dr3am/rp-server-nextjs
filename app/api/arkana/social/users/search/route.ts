import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaSearchUsersSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { validateProfileTokenForUser } from '@/lib/profileTokenUtils';

// GET /api/arkana/social/users/search - Search for Arkana users (sorted by last updated)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const player_uuid = searchParams.get('player_uuid');
    const universe = searchParams.get('universe');
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const timestamp = searchParams.get('timestamp');
    const signature = searchParams.get('signature');
    const token = searchParams.get('token');
    const sessionId = searchParams.get('sessionId') || undefined;

    // Support both token-based (web) and signature-based (LSL) authentication
    if (token) {
      // Web-based authentication using JWT token with session validation
      const tokenValidation = await validateProfileTokenForUser(token, player_uuid || '', universe || 'arkana', sessionId);
      if (!tokenValidation.valid) {
        return NextResponse.json(
          { success: false, error: tokenValidation.error || 'Invalid token' },
          { status: 401 }
        );
      }
    } else {
      // LSL-based authentication using signature validation
      const { error, value } = arkanaSearchUsersSchema.validate({
        player_uuid,
        universe,
        search,
        page,
        limit,
        timestamp,
        signature
      });

      if (error) {
        return NextResponse.json(
          { success: false, error: error.details[0].message },
          { status: 400 }
        );
      }

      const signatureValidation = validateSignature(value.timestamp, value.signature, value.universe);
      if (!signatureValidation.valid) {
        return NextResponse.json(
          { success: false, error: signatureValidation.error || 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    // Verify requesting user exists
    const requestingUser = await prisma.user.findFirst({
      where: { slUuid: player_uuid || '', universe: 'arkana' }
    });

    if (!requestingUser) {
      return NextResponse.json(
        { success: false, error: 'User not found in Arkana universe' },
        { status: 404 }
      );
    }

    // Update last active timestamp
    await prisma.user.update({
      where: { id: requestingUser.id },
      data: { lastActive: new Date() }
    });

    // Build search filter
    const searchFilter = search ? {
      OR: [
        {
          arkanaStats: {
            characterName: {
              contains: search,
              mode: 'insensitive' as const
            }
          }
        },
        {
          username: {
            contains: search,
            mode: 'insensitive' as const
          }
        },
        {
          slUuid: {
            contains: search,
            mode: 'insensitive' as const
          }
        }
      ]
    } : {};

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Query users with Arkana characters, excluding the requesting user
    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where: {
          universe: 'arkana',
          id: {
            not: requestingUser.id // Exclude self from results
          },
          arkanaStats: {
            is: {
              registrationCompleted: true // Only completed registrations
            }
          },
          ...searchFilter
        },
        include: {
          arkanaStats: {
            select: {
              id: true,
              characterName: true,
              race: true,
              archetype: true
            }
          }
        },
        orderBy: {
          lastActive: 'desc' // Sort by most recently active
        },
        skip,
        take: limit
      }),
      prisma.user.count({
        where: {
          universe: 'arkana',
          id: {
            not: requestingUser.id
          },
          arkanaStats: {
            is: {
              registrationCompleted: true
            }
          },
          ...searchFilter
        }
      })
    ]);

    // Format results
    const results = users.map(user => ({
      arkanaId: user.arkanaStats?.id || 0,
      characterName: user.arkanaStats?.characterName || '',
      slUuid: user.slUuid,
      race: user.arkanaStats?.race || '',
      archetype: user.arkanaStats?.archetype || '',
      lastActive: user.lastActive
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      success: true,
      data: {
        users: results,
        pagination: {
          page: page,
          limit: limit,
          totalCount,
          totalPages,
          hasMore: page < totalPages
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
