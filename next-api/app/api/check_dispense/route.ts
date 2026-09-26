import { NextResponse } from 'next/server';
import { getNextPendingPayment, pingEsp } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET() {
  await pingEsp();

  const nextPayment = await getNextPendingPayment();

  if (!nextPayment) {
    return NextResponse.json({
      dispense: false,
    });
  }

  const pulseCount = parseInt(process.env.PULSE_COUNT || '2', 10);
  const pulseDurationMs = parseInt(process.env.PULSE_DURATION_MS || '1000', 10);
  const pulseIntervalMs = parseInt(process.env.PULSE_INTERVAL_MS || '500', 10);

  return NextResponse.json({
    dispense: true,
    id: nextPayment.id,
    amount: nextPayment.amount,
    pulses: pulseCount,
    duration_ms: pulseDurationMs,
    interval_ms: pulseIntervalMs,
  });
}
