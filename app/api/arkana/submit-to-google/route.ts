import { NextRequest, NextResponse } from 'next/server';
import { validateProfileToken } from '@/lib/profileTokenUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, characterData } = body;

    // Validate required fields
    if (!token || !characterData) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: token and characterData' },
        { status: 400 }
      );
    }

    // Validate JWT token
    const tokenValidation = await validateProfileToken(token);
    if (!tokenValidation.valid) {
      return NextResponse.json(
        { success: false, error: tokenValidation.error || 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const profileToken = tokenValidation.profileToken!;
    const user = profileToken.user;

    // Verify token is for Arkana universe
    if (user.universe !== 'arkana') {
      return NextResponse.json(
        { success: false, error: 'Token is not valid for Arkana universe' },
        { status: 401 }
      );
    }

    // Get Google Apps Script URL from environment
    const googleScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
    if (!googleScriptUrl) {
      console.error('GOOGLE_APPS_SCRIPT_URL environment variable is not set');
      return NextResponse.json(
        { success: false, error: 'Google Apps Script is not configured' },
        { status: 500 }
      );
    }

    // Format data as URLSearchParams for Google Apps Script
    const formData = new URLSearchParams();

    // Add all character data fields
    formData.append('name', characterData.name || '');
    formData.append('sl', characterData.sl || '');
    formData.append('alias', characterData.alias || '');
    formData.append('faction', characterData.faction || '');
    formData.append('concept', characterData.concept || '');
    formData.append('job', characterData.job || '');
    formData.append('race', characterData.race || '');
    formData.append('arch', characterData.arch || '');
    formData.append('background', characterData.background || '');
    formData.append('stats', characterData.stats || '');
    formData.append('flaws', characterData.flaws || '');
    formData.append('powers', characterData.powers || '');
    formData.append('cyberSlots', characterData.cyberSlots || '0');
    formData.append('magicSchools', characterData.magicSchools || '');
    formData.append('freeMagicSchool', characterData.freeMagicSchool || '');
    formData.append('freeMagicWeave', characterData.freeMagicWeave || '');
    formData.append('synthralFreeWeave', characterData.synthralFreeWeave || '');
    formData.append('points_total', characterData.points_total || '0');
    formData.append('points_spent', characterData.points_spent || '0');
    formData.append('points_remaining', characterData.points_remaining || '0');
    formData.append('summary', characterData.summary || '');

    // Send to Google Apps Script
    const googleResponse = await fetch(googleScriptUrl, {
      method: 'POST',
      body: formData
    });

    if (!googleResponse.ok) {
      const errorText = await googleResponse.text();
      console.error('Google Apps Script submission failed:', googleResponse.status, errorText);
      return NextResponse.json(
        { success: false, error: 'Failed to send to Google Drive' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { message: 'Character data sent to Google Drive successfully' }
    });

  } catch (error: unknown) {
    console.error('Error submitting to Google Apps Script:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
