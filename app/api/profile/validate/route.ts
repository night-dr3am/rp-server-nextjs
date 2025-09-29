import { NextRequest, NextResponse } from 'next/server';
import { validateProfileTokenSchema } from '@/lib/validation';
import { validateProfileToken } from '@/lib/profileTokenUtils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    // Validate input
    const { error } = validateProfileTokenSchema.validate({ token });
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    // Use shared validation utility (does NOT mark token as used)
    const validationResult = await validateProfileToken(token!);

    if (!validationResult.valid) {
      return NextResponse.json(
        { success: false, error: validationResult.error },
        { status: 401 }
      );
    }

    // Return validation success with user info (token remains unused)
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: validationResult.profileToken!.user.id,
          slUuid: validationResult.profileToken!.user.slUuid,
          username: validationResult.profileToken!.user.username,
          role: validationResult.profileToken!.user.role,
          createdAt: validationResult.profileToken!.user.createdAt,
          lastActive: validationResult.profileToken!.user.lastActive
        },
        tokenId: validationResult.profileToken!.id,
        valid: true,
        expiresAt: validationResult.profileToken!.expiresAt
      }
    });

  } catch (error: unknown) {
    console.error('Error validating profile token:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}