import { NextResponse } from 'next/server';
import { confirmDispense } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID do pagamento ausente' }, { status: 400 });
    }

    const success = await confirmDispense(String(id));
    return NextResponse.json({ success, id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
