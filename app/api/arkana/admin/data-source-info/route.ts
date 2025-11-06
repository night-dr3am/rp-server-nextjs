// API endpoint to get data source information for admin dashboard
// GET /api/arkana/admin/data-source-info

import { NextRequest, NextResponse } from 'next/server';
import { getDataSourceInfo } from '@/lib/arkana/unifiedDataLoader';
import { validateAdminToken } from '@/lib/arkana/adminUtils';

export async function GET(request: NextRequest) {
  try {
    // Get token from header
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No token provided' },
        { status: 400 }
      );
    }

    // Validate admin token
    const adminValidation = await validateAdminToken(token);
    if (!adminValidation.valid) {
      return NextResponse.json(
        { success: false, error: adminValidation.error || 'Invalid admin token' },
        { status: 403 }
      );
    }

    // Get data source information
    const dataSourceInfo = await getDataSourceInfo();

    return NextResponse.json({
      success: true,
      data: dataSourceInfo
    });

  } catch (error) {
    console.error('[API] /api/arkana/admin/data-source-info error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}
