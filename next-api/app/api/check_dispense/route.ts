import { NextResponse } from 'next/server';
import { getNextPendingPayment, pingEsp, enqueuePayment } from '@/lib/queue';

export const dynamic = 'force-dynamic';

let lastMercadoPagoCheck = 0;

// Consulta automática de pagamentos recentes no Mercado Pago (Fallback inteligente)
async function checkRecentMercadoPagoPayments() {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) return;

  const now = Date.now();
  // Evita sobrecarregar a API: checa no máximo a cada 5 segundos
  if (now - lastMercadoPagoCheck < 5000) return;
  lastMercadoPagoCheck = now;

  try {
    const res = await fetch('https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=3', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return;
    const data = await res.json();
    const minAmount = parseFloat(process.env.MINIMUM_AMOUNT || '1.00');

    for (const payment of (data.results || [])) {
      if (payment.status === 'approved' && (payment.transaction_amount || 0) >= minAmount) {
        const paymentDate = new Date(payment.date_created).getTime();
        // Considera pagamentos realizados na última 1 hora (3.600.000 ms) que ainda não foram liberados
        if (now - paymentDate < 3600000) {
          await enqueuePayment(String(payment.id), payment.transaction_amount, 'mercadopago');
        }
      }
    }
  } catch (e) {
    console.error('[Auto-Sync Mercado Pago]:', e);
  }
}

export async function GET() {
  await pingEsp();

  let nextPayment = await getNextPendingPayment();

  // Se a fila estiver vazia, sincroniza com o Mercado Pago para checar se acabou de cair um Pix
  if (!nextPayment) {
    await checkRecentMercadoPagoPayments();
    nextPayment = await getNextPendingPayment();
  }

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
