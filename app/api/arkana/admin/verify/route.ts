import { NextRequest, NextResponse } from 'next/server';
import { arkanaAdminVerifySchema } from '@/lib/validation';
import { validateAdminToken } from '@/lib/arkana/adminUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const { error, value } = arkanaAdminVerifySchema.validate(body);
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

    // Return success with user info
    return NextResponse.json({
      success: true,
      data: {
        message: 'Admin access verified',
        user: {
          id: adminValidation.user!.id,
          slUuid: adminValidation.user!.slUuid,
          username: adminValidation.user!.username,
          universe: adminValidation.user!.universe,
          arkanaRole: adminValidation.arkanaStats!.arkanaRole
        }
      }
    });

  } catch (error: unknown) {
    console.error('Error verifying admin access:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
