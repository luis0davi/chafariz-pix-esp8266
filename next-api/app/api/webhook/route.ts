import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { enqueuePayment } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const url = new URL(req.url);

    // Mercado Pago pode enviar dados no body ou na query string
    const body = await req.json().catch(() => ({}));
    
    // Tenta obter o ID do pagamento de várias formas que o Mercado Pago pode enviar
    let paymentId = body?.data?.id || body?.id || url.searchParams.get('data.id') || url.searchParams.get('id');
    const type = body?.type || body?.topic || url.searchParams.get('type') || url.searchParams.get('topic');

    console.log('[Webhook Mercado Pago] Recebido:', { type, paymentId, body });

    // Se não tiver token configurado, apenas registra e retorna 200 para não travar o webhook
    if (!accessToken) {
      console.warn('[Webhook Mercado Pago] AVISO: MERCADO_PAGO_ACCESS_TOKEN não configurado no .env.local!');
      return NextResponse.json({ received: true, warning: 'Token não configurado' });
    }

    if (!paymentId) {
      return NextResponse.json({ received: true, message: 'Nenhum paymentId encontrado' });
    }

    // Consulta os detalhes reais do pagamento diretamente na API do Mercado Pago
    const client = new MercadoPagoConfig({ accessToken });
    const payment = new Payment(client);
    const paymentDetails = await payment.get({ id: paymentId });

    console.log('[Webhook Mercado Pago] Detalhes do Pagamento:', {
      id: paymentDetails.id,
      status: paymentDetails.status,
      status_detail: paymentDetails.status_detail,
      transaction_amount: paymentDetails.transaction_amount,
    });

    // Verifica se foi aprovado
    if (paymentDetails.status === 'approved') {
      const minimumAmount = parseFloat(process.env.MINIMUM_AMOUNT || '1.00');
      const amount = paymentDetails.transaction_amount || 0;

      if (amount >= minimumAmount) {
        await enqueuePayment(String(paymentDetails.id), amount, 'mercadopago');
        console.log(`[Webhook Mercado Pago] SUCESSO: Pagamento ${paymentDetails.id} de R$ ${amount} enfileirado para liberação de água!`);
      } else {
        console.log(`[Webhook Mercado Pago] Pagamento ${paymentDetails.id} abaixo do valor mínimo (R$ ${amount} < R$ ${minimumAmount}).`);
      }
    }

    return NextResponse.json({ received: true, status: paymentDetails.status });
  } catch (error: any) {
    console.error('[Webhook Mercado Pago] Erro ao processar:', error);
    // Sempre retorne 200 para o Mercado Pago não ficar reenviando em loop em caso de erro temporário
    return NextResponse.json({ received: false, error: error.message }, { status: 200 });
  }
}

// Suporte para GET (algumas versões do webhook do Mercado Pago fazem verificação com GET)
export async function GET() {
  return NextResponse.json({ status: 'Webhook endpoint online' });
}
