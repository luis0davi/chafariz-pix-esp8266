import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCommand(cmd: string[]): Promise<any> {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(`${KV_URL}/${cmd.map(c => encodeURIComponent(c)).join('/')}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      cache: 'no-store',
    });
    const data = await res.json();
    return data.result;
  } catch (e) {
    return null;
  }
}

export async function POST() {
  if (KV_URL && KV_TOKEN) {
    await redisCommand(['DEL', 'chafariz_queue']);
    return NextResponse.json({ success: true, message: 'Fila limpa com sucesso!' });
  }

  return NextResponse.json({ success: true, message: 'Fila local limpa!' });
}
