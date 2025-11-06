// API endpoint to provide Arkana metadata (flaws, powers, skills, etc.) for profile and create pages
// GET /api/arkana/metadata

import { NextRequest, NextResponse } from 'next/server';
import { arkanaMetadataSchema } from '@/lib/validation';
import { validateProfileTokenForUser, associateTokenWithSession } from '@/lib/profileTokenUtils';
import {
  loadAllData,
  getAllFlaws,
  getAllCommonPowers,
  getAllPerks,
  getAllArchPowers,
  getAllCybernetics,
  getAllMagicSchools,
  getAllSkills
} from '@/lib/arkana/dataLoader';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sl_uuid = searchParams.get('sl_uuid');
    const universe = searchParams.get('universe');
    const token = searchParams.get('token');
    const sessionId = searchParams.get('sessionId');

    // Validate input
    const { error, value } = arkanaMetadataSchema.validate({ sl_uuid, universe, token, sessionId });
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    // Validate session ID is provided
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // Validate token for the specific user with session validation
    const validationResult = await validateProfileTokenForUser(value.token, value.sl_uuid!, value.universe, sessionId);

    if (!validationResult.valid) {
      let status = 401;
      let userFriendlyError = validationResult.error;

      // Provide user-friendly error messages
      if (validationResult.error === 'Token expired') {
        userFriendlyError = 'This profile link has expired. Please request a new link from your HUD.';
      } else if (validationResult.error === 'Token does not match requested user') {
        status = 403;
        userFriendlyError = 'This profile link is not valid for the requested user.';
      } else if (validationResult.error === 'Token belongs to a different session') {
        status = 403;
        userFriendlyError = 'This profile link is being used in a different browser session.';
      }

      return NextResponse.json(
        { success: false, error: userFriendlyError },
        { status }
      );
    }

    // Associate token with session if this is the first access
    if (!validationResult.profileToken!.sessionId) {
      await associateTokenWithSession(validationResult.profileToken!.id, validationResult.profileToken!.userId, sessionId);
    }

    // Load all Arkana metadata from database or JSON fallback
    await loadAllData();

    // Return all metadata in single response
    return NextResponse.json(
      {
        success: true,
        data: {
          flaws: getAllFlaws(),
          commonPowers: getAllCommonPowers(),
          perks: getAllPerks(),
          archetypePowers: getAllArchPowers(),
          cybernetics: getAllCybernetics(),
          magicSchools: getAllMagicSchools(),
          skills: getAllSkills()
        }
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
        }
      }
    );
  } catch (error: unknown) {
    console.error('Error loading Arkana metadata:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load metadata',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
