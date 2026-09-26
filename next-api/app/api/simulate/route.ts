import { NextResponse } from 'next/server';
import { enqueuePayment } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const amount = body.amount ? parseFloat(body.amount) : 1.00;
    const simId = 'SIM_' + Date.now();

    const item = enqueuePayment(simId, amount, 'simulation');

    return NextResponse.json({
      success: true,
      message: 'Pagamento simulado enfileirado com sucesso!',
      item,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
