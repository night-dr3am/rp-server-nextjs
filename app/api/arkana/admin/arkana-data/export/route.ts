// Admin API for Exporting Arkana Data to JSON Files
// POST: Export data type to production JSON format

import { NextRequest, NextResponse } from 'next/server';
import { arkanaAdminDataExportBodySchema } from '@/lib/validation';
import { validateAdminToken } from '@/lib/arkana/adminUtils';
import {
  exportToJSON,
  getProductionFilename,
  validateExportData,
  getExportStats
} from '@/lib/arkana/exportUtils';

export async function POST(request: NextRequest) {
  try {
    // Extract token from Authorization header (consistent with other admin endpoints)
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authorization token required' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // 1. Validate input (body only, token from header)
    const { error, value } = arkanaAdminDataExportBodySchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    // 2. Validate admin token
    const adminValidation = await validateAdminToken(token);
    if (!adminValidation.valid) {
      return NextResponse.json(
        { success: false, error: adminValidation.error || 'Access denied' },
        { status: 403 }
      );
    }

    // 3. Validate export data
    const validationErrors = await validateExportData(value.type);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Export data validation failed',
          validationErrors
        },
        { status: 400 }
      );
    }

    // 4. Export data to JSON
    const jsonContent = await exportToJSON(value.type);
    const filename = getProductionFilename(value.type);

    // 5. Get stats
    const stats = await getExportStats(value.type);

    // 6. Prepare headers with defensive checks
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    };

    // Add stats header if available
    if (stats && stats.length > 0 && stats[0]) {
      headers['X-Export-Stats'] = JSON.stringify(stats[0]);
    }

    // 7. Return JSON file as download
    // Note: In a real browser, this would trigger a file download
    // In API testing, you get the JSON content in the response
    return new NextResponse(jsonContent, {
      status: 200,
      headers
    });
  } catch (error: unknown) {
    console.error('Error exporting arkana data:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET: Get export statistics without downloading
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const type = searchParams.get('type') as string | null;

    // 1. Validate input (GET endpoint uses full schema with token in query params)
    const { error, value } = arkanaAdminDataExportBodySchema.validate({
      type
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    // 2. Validate admin token (extracted from query params)
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authorization token required' },
        { status: 401 }
      );
    }

    const adminValidation = await validateAdminToken(token);
    if (!adminValidation.valid) {
      return NextResponse.json(
        { success: false, error: adminValidation.error || 'Access denied' },
        { status: 403 }
      );
    }

    // 3. Get export stats
    const stats = await getExportStats(value.type);

    // 4. Validate data
    const validationErrors = await validateExportData(value.type);

    return NextResponse.json({
      success: true,
      data: {
        stats: stats[0],
        valid: validationErrors.length === 0,
        validationErrors: validationErrors.length > 0 ? validationErrors : undefined
      }
    });
  } catch (error: unknown) {
    console.error('Error getting export stats:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
