import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { payoutSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { error, value } = payoutSchema.validate(body);
    if (error) {
      return NextResponse.json({ success: false, error: error.details[0].message }, { status: 400 });
    }

    const { sl_uuid, universe, copperCoin, jobName, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({ where: { slUuid: sl_uuid, universe }, include: { stats: true } });
      if (!user || !user.stats) {
        throw new Error('User not found');
      }
      const updatedStats = await tx.userStats.update({
        where: { userId: user.id },
        data: { copperCoin: user.stats.copperCoin + copperCoin, lastUpdated: new Date() }
      });
      await tx.event.create({
        data: {
          type: 'JOB_PAYOUT',
          userId: user.id,
          details: { jobName, amount: { copper: copperCoin } }
        }
      });
      return { user, updatedStats };
    });

    return NextResponse.json({
      success: true,
      data: {
        sl_uuid,
        jobName,
        added: { copper: value.copperCoin },
        balance: { copper: result.updatedStats.copperCoin }
      }
    });
  } catch (err: unknown) {
    let message = 'Internal server error';
    let status = 500;
    if (err instanceof Error) {
      message = err.message;
      if (message.includes('not found')) status = 404;
    }
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
