import { NextResponse } from 'next/server';
import { getSystemStats } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET() {
  const stats = await getSystemStats();
  const hasToken = !!process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const minAmount = process.env.MINIMUM_AMOUNT || '1.00';
  const pulseCount = process.env.PULSE_COUNT || '2';
  const pulseDurationMs = process.env.PULSE_DURATION_MS || '1000';

  return NextResponse.json({
    ...stats,
    config: {
      hasToken,
      minAmount,
      pulseCount,
      pulseDurationMs,
    },
  });
}
