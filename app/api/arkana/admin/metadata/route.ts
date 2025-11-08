// Admin metadata endpoint - serves Arkana game data for admin dashboard
// GET /api/arkana/admin/metadata

import { NextRequest, NextResponse } from 'next/server';
import { validateAdminToken } from '@/lib/arkana/adminUtils';
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
    // 1. Validate admin token from Authorization header
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Missing authorization token' },
        { status: 401 }
      );
    }

    const validationResult = await validateAdminToken(token);

    if (!validationResult.valid) {
      return NextResponse.json(
        { success: false, error: validationResult.error || 'Invalid admin token' },
        { status: 401 }
      );
    }

    // 2. Load all Arkana metadata from database or JSON fallback
    await loadAllData();

    // 3. Return all metadata in single response
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
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
        }
      }
    );
  } catch (error: unknown) {
    console.error('Error loading admin metadata:', error);
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
