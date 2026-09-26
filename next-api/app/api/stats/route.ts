import { NextResponse } from 'next/server';
import { getSystemStats } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET() {
  const stats = await getSystemStats();
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
  const hasToken = !!token;
  const tokenSuffix = token.length > 8 ? token.slice(-8) : 'NONE';
  const minAmount = process.env.MINIMUM_AMOUNT || '1.00';
  const pulseCount = process.env.PULSE_COUNT || '2';
  const pulseDurationMs = process.env.PULSE_DURATION_MS || '1000';

  let mpTest = null;
  if (token) {
    try {
      const res = await fetch('https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=3', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await res.json();
      mpTest = {
        httpStatus: res.status,
        totalInAccount: data.paging?.total,
        latestPayments: (data.results || []).map((p: any) => ({
          id: p.id,
          status: p.status,
          amount: p.transaction_amount,
          date_created: p.date_created,
        })),
      };
    } catch (e: any) {
      mpTest = { error: e.message };
    }
  }

  return NextResponse.json({
    ...stats,
    config: {
      hasToken,
      tokenSuffix,
      minAmount,
      pulseCount,
      pulseDurationMs,
    },
    mercadopago_live_check: mpTest,
  });
}
