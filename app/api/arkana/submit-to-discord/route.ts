import { NextRequest, NextResponse } from 'next/server';
import { validateProfileToken } from '@/lib/profileTokenUtils';

// Maximum Discord message length (leaves room for "...(truncated)")
const MAX_DISCORD_MESSAGE_LENGTH = 1980;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, content } = body;

    // Validate required fields
    if (!token || !content) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: token and content' },
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

    // Get Discord webhook URL from environment
    const discordWebhookUrl = process.env.DISCORD_ARKANA_WEBHOOK_URL;
    if (!discordWebhookUrl) {
      console.error('DISCORD_ARKANA_WEBHOOK_URL environment variable is not set');
      return NextResponse.json(
        { success: false, error: 'Discord webhook is not configured' },
        { status: 500 }
      );
    }

    // Truncate message if it exceeds the maximum length
    let message = content;
    if (message.length > MAX_DISCORD_MESSAGE_LENGTH) {
      message = message.substring(0, MAX_DISCORD_MESSAGE_LENGTH) + '...(truncated)';
    }

    // Send to Discord webhook
    const discordResponse = await fetch(discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      console.error('Discord webhook failed:', discordResponse.status, errorText);
      return NextResponse.json(
        { success: false, error: 'Failed to send to Discord' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { message: 'Character data sent to Discord successfully' }
    });

  } catch (error: unknown) {
    console.error('Error submitting to Discord:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
