import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { gorSearchUsersSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { validateProfileTokenForUser } from '@/lib/profileTokenUtils';

// GET /api/gor/social/users/search - Search for Gor users (sorted by last updated)
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
      const tokenValidation = await validateProfileTokenForUser(token, player_uuid || '', universe || 'gor', sessionId);
      if (!tokenValidation.valid) {
        return NextResponse.json(
          { success: false, error: tokenValidation.error || 'Invalid token' },
          { status: 401 }
        );
      }
    } else {
      // LSL-based authentication using signature validation
      const { error, value } = gorSearchUsersSchema.validate({
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
      where: { slUuid: player_uuid || '', universe: 'gor' }
    });

    if (!requestingUser) {
      return NextResponse.json(
        { success: false, error: 'User not found in Gor universe' },
        { status: 404 }
      );
    }

    // Update last active timestamp
    await prisma.user.update({
      where: { id: requestingUser.id },
      data: { lastActive: new Date() }
    });

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build WHERE clause - must properly combine goreanStats filters
    // When searching, use OR across characterName, username, slUuid while requiring registrationCompleted
    const whereClause = search ? {
      universe: 'gor',
      id: {
        not: requestingUser.id // Exclude self from results
      },
      goreanStats: {
        is: {
          registrationCompleted: true // Only completed registrations
        }
      },
      OR: [
        {
          goreanStats: {
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
    } : {
      universe: 'gor',
      id: {
        not: requestingUser.id // Exclude self from results
      },
      goreanStats: {
        is: {
          registrationCompleted: true // Only completed registrations
        }
      }
    };

    // Query users with Gorean characters, excluding the requesting user
    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
        include: {
          goreanStats: {
            select: {
              id: true,
              characterName: true,
              species: true,
              socialStatus: true,
              casteRole: true
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
        where: whereClause
      })
    ]);

    // Format results
    const results = users.map(user => ({
      goreanId: user.goreanStats?.id || 0,
      characterName: user.goreanStats?.characterName || '',
      slUuid: user.slUuid,
      species: user.goreanStats?.species || '',
      status: user.goreanStats?.socialStatus || '',
      casteOrRole: user.goreanStats?.casteRole || '',
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
    console.error('Error searching Gor users:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
